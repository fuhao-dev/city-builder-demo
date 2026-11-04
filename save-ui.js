/* Save manager is a separate native dialog; pending game choices stay untouched. */
(function (root) {
  'use strict';
  root.DSHSaveUI = { create: function (env, options) {
    var S = env.DSHSaves, storage = env.localStorage, doc = env.document;
    var dialog = doc.getElementById('saveManager'), body = doc.getElementById('saveBody');
    var status = doc.getElementById('saveStatus'), cloud = env.DSHCloudSave.create(env, { onChange: updateControls });
    var local, preview = null, loaded = false, working = false, timer = null, stale = false;
    function esc(text) { return String(text).replace(/[&<>"]/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
    function date(time) { return Number.isFinite(time) && time > 0 ? new Date(time).toLocaleString('zh-CN', { hour12: false }) : '尚未保存'; }
    function message(text, bad) { status.textContent = text; status.classList.toggle('save-error', !!bad); }
    function snapshot() { return S.capture(storage); }
    function inspect() { try { return snapshot(); } catch (e) { return null; } }
    function token() { var value = inspect(); return value ? S.fingerprint(value) : S.rawFingerprint(storage); }
    function card(bundle, title) {
      if (!bundle) return '<div class="save-card"><h3>' + esc(title) + '</h3><p class="save-error">本机进度无法校验</p><small>可导出原始数据留存，或从文件 / 云端恢复。</small></div>';
      var s = S.summary(bundle);
      return '<div class="save-card"><h3>' + esc(title) + '</h3><strong>' + esc(s.city) + '</strong>' +
        '<div class="save-metrics"><span>✦ 累计声望 <b>' + s.totalRep + '</b></span><span>🏁 已通关 <b>' + s.cleared + '</b> 关</span>' +
        '<span>👥 人口 <b>' + s.pop + '</b></span><span>💰 金钱 <b>' + s.money + '</b></span></div><small>' + date(s.savedAt) + '</small></div>';
    }
    function button(action, text, disabled) { return '<button class="btn ghost" type="button" data-save-action="' + action + '"' + (disabled ? ' disabled' : '') + '>' + text + '</button>'; }
    function backup(key, title, action) {
      var raw = storage.getItem(key);
      if (!raw) return '<div class="save-backup"><span>' + title + '<small>尚无备份</small></span></div>';
      try {
        var s = S.summary(S.parse(raw));
        return '<div class="save-backup"><span>' + title + '<small>' + date(s.savedAt) + ' · ✦ ' + s.totalRep + ' · ' + esc(s.city) + '</small></span>' + button(action, '查看并恢复') + '</div>';
      } catch (e) { return '<div class="save-backup"><span>' + title + '<small class="save-error">原始备份无法直接恢复，请导出留存</small></span>' + button('export-' + action, '导出原始备份') + '</div>'; }
    }
    function render() {
      if (!dialog.open) return;
      var state = cloud.getState();
      if (preview) {
        body.innerHTML = '<section class="save-preview"><h3 tabindex="-1" id="savePreviewTitle">' + esc(preview.title) + '</h3><div class="save-comparison">' +
          card(local, '当前本机进度') + card(preview.bundle, preview.kind === 'upload' ? '准备上传的进度' : '准备恢复的进度') + '</div><p>' +
          (preview.kind === 'backup' ? '将更新本机手动备份；原手动备份会被替换。当前游戏进度保持不变。' : preview.kind === 'upload' ?
            (preview.remote ? '将覆盖当前 TapTap 账号的云端存档。请确认使用这台设备的进度。' : '将把这台设备的完整进度保存到当前 TapTap 账号。') :
            '将替换本机城市、累计声望、通关记录和 BUFF 方案，随后重新载入。恢复前会保留一份本机原进度。') +
          '</p>' + (preview.remote ? '<p class="save-note-text">云端当前：' + esc(preview.remote.summary || '周目小镇存档') + ' · ' + date(preview.remote.modifiedTime * 1000) + '</p>' : '') +
          '<div class="save-actions">' + button('cancel', '取消') + '<button class="btn primary" type="button" data-save-action="confirm">' +
          (preview.kind === 'upload' ? '确认上传' : preview.kind === 'backup' ? '确认覆盖备份' : '确认恢复并重新载入') + '</button></div></section>';
      } else {
        body.innerHTML = '<div class="save-comparison">' + card(local, '本机进度 · 自动保存') +
          '<section class="save-card"><h3>☁ TapTap 云存档</h3>' + (!state.supported ? '<p>请在支持云存档的 TapTap 客户端中打开。</p><small>网页可使用下方本机备份与文件存档。</small>' :
            !loaded ? '<p>尚未读取云端</p><small>手动同步到当前 TapTap 账号。</small>' :
            !state.archives.length ? '<p>当前账号暂无云存档</p>' :
            state.archives.map(function (row, i) { return '<div class="save-remote"><strong>' + esc(row.summary || '周目小镇存档') + '</strong><small>' +
              date(row.modifiedTime * 1000) + '</small>' + button('download-' + i, '下载并查看') + '</div>'; }).join('')) +
          '<div class="save-actions">' + button('refresh', loaded ? '刷新云端' : '查看云存档', !state.supported) +
          button('upload', '上传本机进度', !state.supported || stale) + '</div></section></div>' +
          '<p class="save-note-text">云端手动同步 · 上传间隔至少 60 秒 · 单份不超过 10 MB</p>' +
          '<section class="save-local"><h3>本机备份与文件</h3><div class="save-actions">' + button('backup', '备份当前进度') + button('export', '导出文件') +
          button('import', '导入文件') + '</div>' + backup(S.backupKey, '手动备份', 'restore-backup') + backup(S.recoveryKey, '上次恢复前的进度', 'restore-recovery') +
          '<small>本机备份仍保存在当前设备；导出文件可自行留存。声音设置保留本机偏好。</small></section>';
      }
      updateControls();
      if (preview) body.querySelector('#savePreviewTitle').focus({ preventScroll: true });
    }
    function updateControls() {
      if (!dialog.open) return;
      var state = cloud.getState(), busy = working || state.busy;
      body.querySelectorAll('button').forEach(function (b) {
        var action = b.dataset.saveAction;
        b.disabled = busy || (stale && action !== 'cancel') ||
          ((action === 'upload' || action === 'refresh') && !state.supported) ||
          ((action === 'upload' || action === 'backup') && !local) ||
          ((action === 'upload' || (action === 'confirm' && preview && preview.kind === 'upload')) && state.cooldown > 0);
        if (action === 'upload') b.textContent = state.cooldown ? '上传冷却 ' + state.cooldown + ' 秒' : '上传本机进度';
      });
    }
    function showPreview(kind, bundle, title, remote) {
      local = inspect();
      preview = { kind: kind, bundle: bundle, title: title, remote: remote || null, expected: token() };
      render();
    }
    async function refresh() {
      await cloud.refresh(true); loaded = true;
      message(cloud.getState().archives.length > 1 ? '检测到多个同名云存档，可分别下载查看；暂不能上传覆盖。' : '云端信息已更新');
    }
    function downloadFile(bundle) {
      var url = env.URL.createObjectURL(new env.Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
      var a = doc.createElement('a'); a.href = url; a.download = 'loop-town-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      doc.body.appendChild(a); a.click(); a.remove(); env.setTimeout(function () { env.URL.revokeObjectURL(url); }, 1000);
    }
    async function act(action) {
      if (working || cloud.getState().busy) return;
      if (action === 'import') { doc.getElementById('saveImport').click(); return; }
      working = true; message('正在处理，请稍候…'); updateControls();
      try {
        if (action === 'cancel') { preview = null; local = inspect(); message('已取消，进度未变'); }
        else if (action === 'refresh') await refresh();
        else if (action === 'export') { downloadFile(local ? snapshot() : S.rawBackup(storage)); message(local ? '已导出完整进度文件' : '已导出原始数据，请留存供修复使用'); }
        else if (action.indexOf('export-restore-') === 0) {
          downloadFile(JSON.parse(storage.getItem(action === 'export-restore-backup' ? S.backupKey : S.recoveryKey))); message('已导出原始备份，请留存供修复使用');
        }
        else if (action === 'backup') {
          var bundle = snapshot();
          if (storage.getItem(S.backupKey)) showPreview('backup', bundle, '覆盖本机手动备份');
          else { storage.setItem(S.backupKey, JSON.stringify(bundle)); message('本机手动备份已保存'); }
        } else if (action.indexOf('restore-') === 0) {
          showPreview('restore', S.parse(storage.getItem(action === 'restore-backup' ? S.backupKey : S.recoveryKey)), '恢复本机备份'); message('请核对进度后确认');
        } else if (action.indexOf('download-') === 0) {
          var row = cloud.getState().archives[Number(action.slice(9))];
          var incoming = await cloud.download(row);
          showPreview('restore', incoming, '恢复云端进度', row); message('已下载并校验，请核对后确认恢复');
        } else if (action === 'upload') {
          await refresh();
          var rows = cloud.getState().archives;
          if (rows.length > 1) throw new Error('发现多个同名云存档，请先在平台整理；可分别下载查看');
          showPreview('upload', snapshot(), rows.length ? '覆盖云端存档' : '创建云端存档', rows[0]); message('请确认上传方向与进度');
        } else if (action === 'confirm' && preview) {
          if (token() !== preview.expected) throw new Error('本机进度已在其他窗口变化，请关闭后重新打开存档管理');
          if (preview.kind === 'upload') {
            await cloud.upload(preview.bundle, preview.remote); loaded = true; preview = null; message('云端存档已保存');
          } else if (preview.kind === 'backup') {
            storage.setItem(S.backupKey, JSON.stringify(preview.bundle)); preview = null; message('手动备份已更新');
          } else {
            S.apply(storage, preview.bundle, preview.expected);
            message('恢复成功，正在重新载入…'); options.reload(); return;
          }
        }
      } catch (e) {
        if (e.code === 'conflict') { preview = null; loaded = false; }
        message(e.message || '操作未完成，请检查本机存储空间后重试', true);
      } finally { working = false; render(); }
    }
    function close() {
      dialog.close();
    }
    doc.getElementById('saveClose').addEventListener('click', close);
    dialog.addEventListener('close', function () { env.clearInterval(timer); timer = null; preview = null; });
    body.addEventListener('click', function (e) { var b = e.target.closest('[data-save-action]'); if (b && !b.disabled) act(b.dataset.saveAction); });
    doc.getElementById('saveImport').addEventListener('change', async function () {
      var file = this.files[0]; this.value = ''; if (!file) return;
      working = true; updateControls();
      try {
        if (file.size > S.maxBytes) throw new Error('文件超过 10 MB，无法导入');
        var bundle = S.parse(await file.text());
        showPreview('restore', bundle, '导入文件进度'); message('文件已校验，请核对后确认恢复');
      } catch (e) { message(e.message, true); }
      finally { working = false; render(); }
    });
    env.addEventListener('storage', function (e) {
      if (dialog.open && Object.keys(S.keys).some(function (key) { return S.keys[key] === e.key; })) {
        stale = true; message('另一窗口修改了本机进度，请关闭并重新打开存档管理', true); updateControls();
      }
    });
    return { open: function () {
      try {
        local = inspect(); preview = null; stale = false;
        if (!dialog.open) dialog.showModal();
        message(working ? '云存档操作仍在进行，请稍候；可关闭窗口继续游戏。' : options.isTutorial && options.isTutorial() ?
          '这里管理正式游戏进度。新手练习不会写入备份、导出文件或云存档。' : '本机自动保存；云端需手动同步。恢复时整份替换，声望不会重复相加。'); render();
        env.clearInterval(timer);
        timer = env.setInterval(updateControls, 1000);
      } catch (e) { options.toast('存档读取失败：' + e.message); }
    } };
  } };
})(window);

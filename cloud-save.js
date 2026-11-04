/* TapTap H5/minigame cloud save adapter. One named archive; manual, serialized operations. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./saves.js'));
  else root.DSHCloudSave = factory(root.DSHSaves);
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';
  var NAME = 'loop_town_main_v1', META = 'dsh_city_cloud_meta_v1', INTERVAL = 60000;
  var MESSAGES = { 400000: '存档大小超出平台限制', 400001: '上传过于频繁，请等待冷却结束',
    400002: '云端存档已变化或被移除，请刷新列表', 400003: '云存档数量已达到平台上限',
    400005: '云端总存储空间已满', 400006: '上传耗时过长，结果待确认，请稍后刷新列表',
    400007: '平台正在处理其他存档操作，请稍后手动重试', 400008: '云存储服务暂时不可用',
    400009: '平台拒绝了存档名称', 400100: '云存档初始化失败，请检查 TapTap 客户端与账号',
    400101: '本地存档文件未能创建', 1300202: 'TapTap 本地文件空间不足' };
  function error(message, code) { var e = new Error(message); e.code = code; return e; }
  function call(target, method, args) {
    return new Promise(function (resolve, reject) {
      var options = Object.assign({}, args, { success: resolve, fail: reject });
      try {
        var result = target[method](options);
        if (result && typeof result.then === 'function') result.then(resolve, reject);
      } catch (e) { reject(e); }
    });
  }
  // fileId is the provider's revision token; client clocks are not authoritative.
  function same(a, b) { return (!a && !b) || !!(a && b && a.uuid === b.uuid && a.fileId === b.fileId); }
  function create(env, options) {
    options = options || {};
    var now = options.now || Date.now, storage = env.localStorage, manager, fs, base, busy = false, archives = [], lastRead = -Infinity, attemptedAt = null, uncertain = false;
    var notify = options.onChange || function () {};
    function supported() {
      var tap = env.tap;
      return !!(tap && typeof tap.getCloudSaveManager === 'function' && typeof tap.getFileSystemManager === 'function' && tap.env && tap.env.USER_DATA_PATH);
    }
    function meta() {
      try { var value = JSON.parse(storage.getItem(META) || '{}'); return value && typeof value === 'object' ? value : {}; }
      catch (e) { return {}; }
    }
    function remaining() {
      var persisted = meta().attemptedAt;
      var last = Math.max(attemptedAt === null ? -Infinity : attemptedAt, typeof persisted === 'number' && isFinite(persisted) ? persisted : -Infinity);
      return Math.max(0, Math.ceil((last + INTERVAL - now()) / 1000));
    }
    function state() { return { supported: supported(), busy: busy, archives: archives.slice(), cooldown: remaining(), uncertain: uncertain }; }
    function emit() { notify(state()); }
    function init() {
      if (!supported()) throw error('请在支持云存档的 TapTap 客户端中打开；本机存档仍可使用');
      if (!manager) {
        var candidate = env.tap.getCloudSaveManager(), files = env.tap.getFileSystemManager();
        if (!candidate || !files || ['getArchiveList','getArchiveData','createArchive','updateArchive'].some(function (method) { return typeof candidate[method] !== 'function'; }) ||
            typeof files.writeFile !== 'function' || typeof files.readFile !== 'function') throw error('当前 TapTap 版本未提供完整云存档能力，请更新客户端');
        manager = candidate; fs = files; base = env.tap.env.USER_DATA_PATH.replace(/\/$/, '');
      }
    }
    async function exclusive(work) {
      if (busy) throw error('正在处理存档，请等待当前操作完成');
      busy = true; emit();
      try {
        init();
        if (env.navigator && env.navigator.locks && typeof env.navigator.locks.request === 'function') {
          return await env.navigator.locks.request('loop-town-cloud-save', { ifAvailable: true }, function (lock) {
            if (!lock) throw error('另一窗口正在处理云存档，请等待完成');
            return work();
          });
        }
        return await work();
      }
      catch (e) {
        var rawCode = e && (e.errno || e.code), code = Math.abs(Number(rawCode));
        if (code === 400001) {
          attemptedAt = now();
          try { storage.setItem(META, JSON.stringify({ attemptedAt: attemptedAt })); } catch (ignored) {}
        }
        throw error(MESSAGES[code] || (e && (e.message || e.errMsg)) || '云存档操作失败，请检查网络后手动重试', code || rawCode);
      } finally { busy = false; emit(); }
    }
    async function list(force) {
      if (!force && now() - lastRead < 15000) return archives.slice();
      var result = await call(manager, 'getArchiveList', {});
      if (!result || !Array.isArray(result.saves)) throw error('云端返回了无效的存档列表');
      archives = result.saves.filter(function (row) { return row && row.name === NAME && typeof row.uuid === 'string' && row.uuid && typeof row.fileId === 'string' && row.fileId; })
        .map(function (row) { return Object.assign({}, row); });
      lastRead = now(); uncertain = false; emit(); return archives.slice();
    }
    function refresh(force) { return exclusive(function () { return list(!!force); }); }
    function upload(input, expected) {
      var bundle;
      try { bundle = S.parse(input); } catch (e) { return Promise.reject(e); }
      return exclusive(async function () {
        if (remaining()) throw error('距离下次上传还需 ' + remaining() + ' 秒');
        var rows = await list(true);
        if (rows.length > 1) throw error('发现多个同名云存档，请先在平台整理；可分别下载查看');
        if (!same(rows[0] || null, expected || null)) throw error('云端已被其他设备更新，请重新查看并确认覆盖', 'conflict');
        var text = JSON.stringify(bundle), path = base + '/loop_town_upload.json';
        if (S.bytes(text) > S.maxBytes) throw error('存档超过 10 MB，无法上传');
        await call(fs, 'writeFile', { filePath: path, data: text, encoding: 'utf8' });
        if (remaining()) throw error('另一窗口刚刚上传过，请等待冷却结束');
        attemptedAt = now();
        // Persist BEFORE invoking the quota-limited method, including failed/uncertain attempts.
        storage.setItem(META, JSON.stringify({ attemptedAt: attemptedAt }));
        var info = S.summary(bundle), args = { archiveFilePath: path, archiveMetaData: {
          name: NAME, summary: ('周目小镇 · ' + info.city + ' · 累计声望 ' + info.totalRep).slice(0, 140),
          extra: JSON.stringify({ format: 'loop-town-save', version: 1, savedAt: bundle.payload.savedAt,
            checksum: bundle.checksum, totalRep: info.totalRep, cleared: info.cleared }) } };
        var result;
        try {
          uncertain = true;
          if (rows[0]) { args.archiveUUID = rows[0].uuid; result = await call(manager, 'updateArchive', args); }
          else result = await call(manager, 'createArchive', args);
        } catch (e) { lastRead = -Infinity; throw e; }
        if (!result || typeof result.uuid !== 'string' || typeof result.fileId !== 'string') throw error('上传结果待确认，请刷新云端列表；不要连续重传');
        archives = [Object.assign({}, rows[0] || {}, args.archiveMetaData, result, { modifiedTime: Math.floor(now() / 1000), saveSize: S.bytes(text) })];
        uncertain = false; lastRead = now(); emit(); return result;
      });
    }
    function download(expected) {
      return exclusive(async function () {
        var rows = await list(true), row = rows.filter(function (r) { return r.uuid === expected.uuid; })[0];
        if (!same(row, expected)) throw error('云端存档已变化，请刷新后重新下载', 'conflict');
        if (typeof row.saveSize === 'number' && row.saveSize > S.maxBytes) throw error('云端存档超过 10 MB，无法读取');
        var downloaded = await call(manager, 'getArchiveData', { archiveUUID: row.uuid, archiveFileId: row.fileId,
          targetFilePath: base + '/loop_town_download.json' });
        if (!downloaded || typeof downloaded.filePath !== 'string') throw error('云端没有返回存档文件');
        var result = await call(fs, 'readFile', { filePath: downloaded.filePath, encoding: 'utf8' });
        if (!result || typeof result.data !== 'string') throw error('存档文件内容无效');
        return S.parse(result.data);
      });
    }
    return { getState: state, refresh: refresh, upload: upload, download: download, archiveName: NAME };
  }
  return { create: create, archiveName: NAME, interval: INTERVAL, metaKey: META };
});

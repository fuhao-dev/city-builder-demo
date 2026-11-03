# 城建设计局图标

以金色市政建筑和青绿色楼群为中心，加入住宅、公共设施、街道与绿化，城市内容铺满四边和四角，不保留外围空白。采用更粗的像素块、阶梯轮廓和深色描边，图像不含文字。

## 文件

| 文件 | 尺寸 / 用途 |
|---|---|
| city-builder-master.png | 1254 × 1254，生成原图 |
| icon-512.png | 512 × 512，通用应用图标与分享素材 |
| icon-192.png | 192 × 192，页头与浏览器图标 |
| apple-touch-icon.png | 180 × 180，iOS 主屏幕 |
| favicon-32.png | 32 × 32，网页标签 |
| ../../favicon.ico | 内含 16 / 32 / 48 像素 PNG 图层，浏览器兼容入口 |

## 生成记录

- 日期：2026-11-03。
- 工具：内置 image_gen；根据前版图标重绘为满版城市街区，增加城市内容和像素感，未使用 CLI/API fallback。
- 像素版原始图像完整保存；各尺寸仅作最近邻等比缩放与格式转换，保留像素边缘，没有更改构图。
- 配色依据现有游戏：深蓝 #0b1220、青绿 #57e0c0、金色 #f5c26b、侧面蓝灰 #26344d。
- 图标原图为完整方形，网页页头通过 CSS 显示圆角；各平台可自行裁切。

## 最终生成提示词

```text
Use case: style-transfer.
Asset type: one finished square app icon for the city-building game 城建设计局.
Edit target: the provided navy, teal, and gold city icon. Keep its color identity and the idea of a golden civic building among turquoise city towers, but completely recompose it to satisfy these changes.
PRIMARY CHANGES:
1. NO EMPTY MARGINS. Fill the ENTIRE square edge to edge with a dense, lively miniature city. Remove the floating diamond pedestal and remove the large plain navy background. Buildings, paved streets, little plots of greenery and urban blocks must extend to and crop off ALL FOUR edges and corners. No empty sky, no blank border, no dark halo. The artwork should look like a close crop from a city-building game's map, not an isolated logo on a background.
2. MORE CITY CONTENT, with a clear focal point. A warm gold-roofed civic building anchors the center, flanked by two chunky turquoise stepped towers. Surround them with several smaller pixel houses and service buildings, a short intersecting street with large simple road markings, and a few blocky trees/green plots filling the remaining gaps. Maintain a balanced hierarchy rather than equally tiny detail everywhere. Richer city content, still readable as an app icon.
3. MUCH MORE OBVIOUS PIXEL ART. Draw it as authentic coarse 64-by-64 pixel game art, then visibly enlarge the exact square pixels to fill the image using nearest-neighbor style. Every contour, window, tree, roof and shadow must align to the SAME LARGE pixel grid. Very visible chunky pixels and stair-step diagonals, firm navy outlines, roughly 16 flat solid colors, hard two-tone face shading. Nostalgic 16-bit city-building game aesthetic. Deliberate pixel clusters, not a filtered smooth illustration.
Palette: deep navy #0b1220 for roads and outlines, bright teal #57e0c0 for towers and park accents, warm gold #f5c26b for the central building, slate-blue #26344d for shaded walls, a little dark green for trees. Keep the central gold building strongly legible.
Composition: square, close isometric or three-quarter urban map view, full bleed and tightly packed with city tiles to every edge; no detached floating platform.
Avoid: all gradients, glossy 3D, soft shadows, texture noise, thin linework, antialiasing, tiny smooth details, whitespace, empty background, frames, rounded-corner masks, lettering, numbers, watermarks, mockups, icon sheets. Output only the final full-bleed pixel city icon.
```

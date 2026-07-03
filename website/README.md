# 无限之书官网

这是一个独立静态官网，不依赖现有后台、服务端或 Android 项目。

## 本地预览

直接打开 `website/index.html` 即可预览。

也可以在仓库根目录启动一个静态服务：

```bash
python3 -m http.server 8088 -d website
```

然后访问：

```text
http://localhost:8088
```

## 文件说明

- `index.html`：官网页面结构与文案
- `styles.css`：视觉样式与响应式布局
- `main.js`：移动端导航和滚动入场动画

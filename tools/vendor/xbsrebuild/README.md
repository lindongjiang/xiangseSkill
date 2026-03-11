# 香色闺阁xbs书源加解密工具

## linux、macOS在终端运行需要对程序添加可执行权限
```
chmod +x 程序路径
```

## 启动转换web服务
```
// 默认监听0.0.0.0:8282
xbsrebuild server 
// 指定监听地址
xbsrebuild server -s 127.0.0.1 -p 8282
```

## xbs 转 json
```
xbsrebuild xbs2json -i xx.xbs -o xx.json
```
## json 转 xbs
```
xbsrebuild json2xbs -i xx.json -o xx.xbs
```

## Windows amd64 产物规范（供 skill 内置分发）

标准产物（固定命名）：

- `xbsrebuild.exe`
- `xbsrebuild.exe.sha256`

建议版本标识：

- 在元数据中记录 `git commit`（短 SHA）与构建时间。
- 如需保留历史版本，可在发布目录使用 `xbsrebuild-windows-amd64-<commit>.zip` 封装。

本地构建（Windows amd64）：

```bash
GOOS=windows GOARCH=amd64 go build -ldflags '-w -s' -o xbsrebuild.exe .
sha256sum xbsrebuild.exe > xbsrebuild.exe.sha256
```

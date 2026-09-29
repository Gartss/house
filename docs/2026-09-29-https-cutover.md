# 2026-09-29 HTTPS 部署检查

## 部署结构

- 域名：`follyu.com`，A 记录指向 ECS `39.106.93.99`（北京）。
- 公网入口：Caddy 容器 `house-https` 接管 80 和 443；[配置](../infra/Caddyfile)将请求代理到 Docker 内部网络的 `house-app:3000`。
- 应用：沿用已有镜像 `house-app:20260916-import-quote-fixes`，容器 `house-app` 不发布宿主机端口；持久化目录继续挂载 `/opt/house-data:/data`。
- TLS：Caddy 自动申请与续期，证书及配置状态分别持久化于 ECS `/opt/house-https/data` 和 `/opt/house-https/config`。
- 回滚材料：切换前应用容器保留为 `house-app-before-https`（已停止）；数据备份位于 ECS `/opt/house-backups/house-data-20260929-before-https.tar.gz`（8.0 MB，root 持有，权限 600）。临时验证容器 `house-https-stage` 已停止。
- 安全组：入站开放 80、443；原 8080 放行规则已撤销。原有 22、3389 规则未在本次调整。

## 切换后验证

| 检查 | 结果 |
| --- | --- |
| `http://follyu.com/` | 308，跳转 `https://follyu.com/` |
| `https://follyu.com/` | HTTP/2 200，响应服务器为 Caddy |
| `https://follyu.com/api/state`（未登录） | 401 |
| 应用容器端口 | 仅容器内 `3000/tcp`，无宿主机映射 |
| 证书 | Let's Encrypt，`CN=follyu.com`，有效期 2026-09-29 至 2026-12-28（UTC） |
| 安全组 8080 | 无入站规则 |

HTTPS 切换阶段仅调整入口和容器网络，未部署本地未提交的网页与小程序代码。

## ICP 备案页脚上线

- 后续经用户确认上线，基于生产源码提交 `891be65` 单独构建网页端，只加入备案号页脚：`沪ICP备2026049438号-1`，链接至 `https://beian.miit.gov.cn/`。展示于房源列表空状态、非空列表及“我的”页面。
- 新镜像：`house-app:20260929-icp-footer`（`sha256:3222898ff5444e7e9c8d52b48608261f3bd0cca0503b0941b902282a2367577c`）。发布包 SHA-256：`dca9b867da8ec05f9a28be93cad4c51f016cf70a43d3e25cbc9853ca40f4e491`，与 ECS 上的文件一致。
- 切换前数据备份：ECS `/opt/house-backups/house-data-20260929-before-icp.tar.gz`（8,383,717 字节，权限 600）。旧应用容器保留为已停止的 `house-app-before-icp`，供回滚使用。新容器继续挂载 `/opt/house-data:/data`。
- 本地通过 TypeScript 检查、核心测试和生产构建；云助手切换命令 `c-bj06yhxk79kvqww` 成功退出，容器运行正常。
- 线上复核：`https://follyu.com/` 返回 200，页面实际显示备案号及工信部链接；HTTP 入口返回 308 跳转 HTTPS；未登录的 `/api/state` 返回 401；公网 8080 无法访问。
- 此次备案展示仅适用于网站。微信小程序端无需展示网站 ICP 备案页脚，本次未修改。

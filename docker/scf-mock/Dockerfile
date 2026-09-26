# SCF Invoke 本地模拟器镜像（仅 dev，不进 CI/生产）：复核 TC3 签名并派生本地 job 容器。
# 需在 compose 挂载 /var/run/docker.sock（sibling 容器派生）与仓库根 /repo:ro（job 镜像构建上下文）。
FROM node:22-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY server.mjs .
EXPOSE 9011
# docker.sock 属 root，dev 工具镜像保持 root 运行
CMD ["node", "server.mjs"]

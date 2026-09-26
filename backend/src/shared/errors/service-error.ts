// 服务层业务错误（携带 HTTP 语义状态码）唯一定义点：原散落在 llm-config / chat-session /
// anticheat-exemption / job-trigger 四处的同名类收编至此，各处 re-export 保持既有 import
// 路径不变；instanceof 判定随之跨域一致（路由层无需再逐域导入比对）。
export class ServiceError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

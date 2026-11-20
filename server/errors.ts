/** 帶有 HTTP 狀態碼的錯誤,訊息會直接顯示給使用者。 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

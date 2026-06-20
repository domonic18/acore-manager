declare module 'svg-captcha' {
  export interface CaptchaOptions {
    size?: number;
    width?: number;
    height?: number;
    fontSize?: number;
    ignoreChars?: string;
    noise?: number;
    color?: boolean;
    background?: string;
    length?: number;
  }

  export interface CaptchaResult {
    data: string;
    text: string;
  }

  export function create(options?: CaptchaOptions): CaptchaResult;
}

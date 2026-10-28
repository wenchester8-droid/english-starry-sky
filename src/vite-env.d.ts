/// <reference types="vite/client" />

/** 打包时间，作为版本号（vite.config.ts 里定义） */
declare const __BUILD__: string;
/** 给人看的版本号，取自 package.json（vite.config.ts 里定义） */
declare const __VERSION__: string;

interface ImportMetaEnv {
  /** 腾讯云开发环境号（.env.local），不填就只有游客模式 */
  readonly VITE_CLOUD_ENV?: string;
}

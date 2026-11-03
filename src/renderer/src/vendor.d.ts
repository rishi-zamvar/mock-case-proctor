// Minimal module types for the untyped TalkingHead ESM build (only avatarEngine.ts imports it).
declare module '@met4citizen/talkinghead' {
  export class TalkingHead {
    constructor(node: HTMLElement, opt?: Record<string, unknown>)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped vendor class; avatarEngine narrows it to TalkingHeadLike
    [k: string]: any
  }
}
declare module '@met4citizen/talkinghead/modules/lipsync-en.mjs' {
  export class LipsyncEn {}
}

export type RadioDesktop = {
  configure: (code: string) => Promise<boolean>;
  onPtt: (callback: (down: boolean) => void) => () => void;
};
export function radioDesktop(): RadioDesktop | undefined {
  return typeof window === 'undefined' ? undefined : (window as Window & { radioDesktop?: RadioDesktop }).radioDesktop;
}

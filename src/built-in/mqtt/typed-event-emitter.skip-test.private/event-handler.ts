export type EventHandler =
  | ((arg1: any, arg2: any, arg3: any, arg4: any) => void)
  | ((arg1: any, arg2: any, arg3: any) => void)
  | ((arg1: any, arg2: any) => void)
  | ((arg1: any) => void)
  | ((...args: any[]) => void);

import { IRoute } from 'types/navigation';

// 模板遗留（原注释写 "NextJS Requirement"）。现仅剩 components/rtlProvider/RtlProvider.tsx 一个消费方，
// 该文件属无渲染入口的死代码，本批不碰，故保留导出。
export const isWindowAvailable = () => typeof window !== 'undefined';

export const findCurrentRoute = (
  routes: IRoute[],
  pathname: string,
): IRoute => {
  // M1-A-BRIEF F002 — 此处原有 `if (!isWindowAvailable()) return null;`。
  // 本函数是纯函数：只读 routes 与 pathname，两者在服务端同样可得，该守卫从来没有必要。
  // 全站包 NoSSR 时它无症状；恢复 SSR 后它让服务端恒走 null 分支 →
  // getActiveRoute 回落 'Main Dashboard'，而客户端解析出真实路由名（如「创作者库」），
  // 于是每个 admin 页的 navbar 标题都触发 hydration mismatch（React #418）——
  // 正是 React 报错里列在第一条的「server/client 分支」。
  // 删除后客户端行为完全不变（客户端本就走 true 分支），只有服务端从「恒 null」变为「正常匹配」。
  for (let route of routes) {
    if (!!route.items) {
      const found = findCurrentRoute(route.items, pathname);
      if (!!found) return found;
    }
    if (pathname?.match(route.path) && route) return route;
  }
};

export const getActiveRoute = (routes: IRoute[], pathname: string): string => {
  const route = findCurrentRoute(routes, pathname);
  return route?.name || 'Main Dashboard';
};

export const getActiveNavbar = (
  routes: IRoute[],
  pathname: string,
): boolean => {
  const route = findCurrentRoute(routes, pathname);
  return route?.secondary;
};

export const getActiveNavbarText = (
  routes: IRoute[],
  pathname: string,
): string | boolean => {
  return getActiveRoute(routes, pathname) || false;
};

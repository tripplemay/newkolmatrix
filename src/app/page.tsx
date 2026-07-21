import { redirect } from 'next/navigation';
// ARCH-M05 fixing FIX-3：根入口直指真实首页（原经 legacy 桩 /admin/dashboards/default 三跳绕行，
// 桩按兼容寿命清理后 / 将 404——verify-B O-1）。
export default function Home({}) {
  redirect('/admin/today');
}

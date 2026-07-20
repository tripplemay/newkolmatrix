import { redirect } from 'next/navigation';
// 修 /admin/dashboards 404（Horizon scaffold 残留，F007 evaluator 记录）
export default function Dashboards() { redirect('/admin/today'); }

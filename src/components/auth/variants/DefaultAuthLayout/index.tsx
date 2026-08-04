// M5-AUTH-RLS F002 — fork 留痕（template-port-guide.md §2.4）。
// 模板库存件（docs/dev/template-inventory.md B 组），本批由 /login 与 /signup 接线启用。
//
// 改动点两处，均属 port-guide §2.4 允许的「品牌替换」，**布局结构零改动**
//（外层容器、右侧渐变面板的尺寸/圆角/断点、footer 位置全部原样）：
//  1. 右侧品牌面板原本铺的是模板素材 `/public/img/auth/auth.png`——那张图上印着
//     「Horizon UI」logo 与「Learn more about Horizon UI on horizon-ui.com」，
//     是**模板厂商的广告位**，出现在本产品登录页属产品缺陷。改为复用仓内既有的
//     KOLMatrix 品牌记号（KM 渐变方块 + KOL/Matrix 双字重字标，与 sidebar S1-1/2 同款），
//     不新建任何素材、不引入新设计。
//  2. 左上返回链「Back to Dashboard」→「返回工作台」，目标 /admin → /admin/today
//     （/admin 本身就是 redirect('/admin/today') 的转发桩，语义不变，少一跳）。
import NavLink from 'components/link/NavLink';
import Footer from 'components/footer/FooterAuthDefault';
function Default(props: { maincard: JSX.Element }) {
  const { maincard } = props;
  return (
    <div className="relative flex">
      <div className="mx-auto flex min-h-full w-full flex-col justify-start pt-12 md:max-w-[75%] lg:h-screen lg:max-w-[1013px] lg:px-8 lg:pt-0 xl:h-[100vh] xl:max-w-[1383px] xl:px-0 xl:pl-[70px]">
        <div className="mb-auto flex flex-col pl-5 pr-5 md:pl-12 md:pr-0 lg:max-w-[48%] lg:pl-0 xl:max-w-full">
          <NavLink href="/admin/today" className="mt-0 w-max lg:pt-10">
            <div className="mx-auto flex h-fit w-fit items-center hover:cursor-pointer">
              <svg
                width="8"
                height="12"
                viewBox="0 0 8 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6.70994 2.11997L2.82994 5.99997L6.70994 9.87997C7.09994 10.27 7.09994 10.9 6.70994 11.29C6.31994 11.68 5.68994 11.68 5.29994 11.29L0.709941 6.69997C0.319941 6.30997 0.319941 5.67997 0.709941 5.28997L5.29994 0.699971C5.68994 0.309971 6.31994 0.309971 6.70994 0.699971C7.08994 1.08997 7.09994 1.72997 6.70994 2.11997V2.11997Z"
                  fill="#A3AED0"
                />
              </svg>
              <p className="ml-3 text-sm text-gray-600">返回工作台</p>
            </div>
          </NavLink>
          {maincard}
          <div className="absolute right-0 hidden h-full min-h-screen md:block lg:w-[49vw] 2xl:w-[44vw]">
            <div
              className={`absolute flex h-full w-full items-end justify-center bg-gradient-to-br from-brand-400 to-brand-600 bg-cover bg-center lg:rounded-bl-[120px] xl:rounded-bl-[200px]`}
            >
              <div className="relative flex h-full w-full items-center justify-center">
                {/* 品牌记号：与 sidebar 品牌区同一构成（KM 方块 + 双字重字标），故无新设计面 */}
                <div className="flex flex-col items-center gap-6 px-10 text-center">
                  <span className="grid h-[72px] w-[72px] place-items-center rounded-[22px] bg-white/15 font-poppins text-3xl font-extrabold text-white backdrop-blur-sm">
                    KM
                  </span>
                  <div className="font-poppins text-[40px] leading-tight tracking-tight text-white">
                    <span className="font-extrabold">KOL</span>
                    <span className="font-light">Matrix</span>
                  </div>
                  <p className="max-w-[320px] text-base text-white/80">
                    AI 驱动的 KOL 营销管理平台
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

export default Default;

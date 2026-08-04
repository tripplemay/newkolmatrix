/*eslint-disable*/
// M5-AUTH-RLS F002 — fork 留痕（template-port-guide.md §2.4）。
// 模板库存件（docs/dev/template-inventory.md B 组「认证批次储备」），本批由 /login 与 /signup
// 经 DefaultAuthLayout 接线启用。
//
// 改动点 **仅一处**：版权署名 "Horizon UI" → "KOLMatrix"（品牌替换，port-guide §2.4 允许项）。
// 未改动：右侧四条链接（Support / License / Terms of Use / Blog）的标签与目标仍是模板 vendor 地址
// —— 本批无对应产品页，删掉即「简化模板区块」（spec §2.3 禁），故保留结构原样并登记：
// 待产品支持页 / 条款页就位后重指目标。见 F002 commit 正文「已知偏差」。
export default function Footer() {
  return (
    <div className="z-[5] mx-auto flex w-full max-w-screen-sm flex-col items-center justify-between px-[20px] pb-4 lg:mb-6 lg:max-w-[100%] lg:flex-row xl:mb-2 xl:w-[1310px] xl:pb-6">
      <p className="mb-6 text-center text-sm text-gray-600 md:text-base lg:mb-0">
        ©{new Date().getFullYear()} KOLMatrix. All Rights Reserved.
      </p>
      <ul className="flex flex-wrap items-center sm:flex-nowrap">
        <li className="mr-12">
          <a
            target="blank"
            href="mailto:hello@simmmple.com"
            className="text-sm text-gray-600 hover:text-gray-600 md:text-base lg:text-white lg:hover:text-white"
          >
            Support
          </a>
        </li>
        <li className="mr-12">
          <a
            target="blank"
            href="https://simmmple.com/licenses"
            className="text-sm text-gray-600 hover:text-gray-600 md:text-base lg:text-white lg:hover:text-white"
          >
            License
          </a>
        </li>
        <li className="mr-12">
          <a
            target="blank"
            href="https://simmmple.com/terms-of-service"
            className="text-sm text-gray-600 hover:text-gray-600 md:text-base lg:text-white lg:hover:text-white"
          >
            Terms of Use
          </a>
        </li>
        <li>
          <a
            target="blank"
            href="https://blog.horizon-ui.com/"
            className="text-sm text-gray-600 hover:text-gray-600 md:text-base lg:text-white lg:hover:text-white"
          >
            Blog
          </a>
        </li>
      </ul>
    </div>
  );
}

/** Static picture of the campaign report, with sample numbers that add up (rows sum to the tiles). */
const ROWS = [
  { name: "Push · VPN · US", clicks: 82_410, conv: 1_236, revenue: 14_832, cost: 9_140 },
  { name: "Native · Finance · FR", clicks: 41_902, conv: 503, revenue: 9_054, cost: 6_912 },
  { name: "Meta · Lead gen · UK", clicks: 12_775, conv: 894, revenue: 7_152, cost: 6_061 },
  { name: "Pop · Utilities · DE", clicks: 111_304, conv: 779, revenue: 5_453, cost: 6_196 },
];

const PROFIT_BY_DAY = [640, 910, 820, 1_240, 1_090, 1_530, 1_952];

const number = (value: number) => value.toLocaleString("en-US");
const money = (value: number) => `$${value.toLocaleString("en-US")}`;
const roi = (revenue: number, cost: number) => ((revenue - cost) / cost) * 100;

export function ProductMock() {
  const total = ROWS.reduce(
    (sum, row) => ({
      clicks: sum.clicks + row.clicks,
      conv: sum.conv + row.conv,
      revenue: sum.revenue + row.revenue,
      cost: sum.cost + row.cost,
    }),
    { clicks: 0, conv: 0, revenue: 0, cost: 0 },
  );
  const max = Math.max(...PROFIT_BY_DAY);
  const points = PROFIT_BY_DAY.map((value, index) => {
    const x = (index / (PROFIT_BY_DAY.length - 1)) * 300;
    const y = 70 - (value / max) * 60;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <figure aria-label="Capve campaign report with sample data" className="mk-mock">
      <div className="mk-mock-bar">
        <i />
        <i />
        <i />
        <span className="ml-2">capve.app/app/reports</span>
        <span className="ml-auto rounded-md border border-[#26262a] px-2 py-0.5 text-[11px]">Last 7 days</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <div className="mk-mock-stat">
          <span>Clicks</span>
          <b>{number(total.clicks)}</b>
        </div>
        <div className="mk-mock-stat">
          <span>Conversions</span>
          <b>{number(total.conv)}</b>
        </div>
        <div className="mk-mock-stat">
          <span>Profit</span>
          <b className="mk-pos">{money(total.revenue - total.cost)}</b>
        </div>
        <div className="mk-mock-stat">
          <span>ROI</span>
          <b className="mk-pos">+{roi(total.revenue, total.cost).toFixed(1)}%</b>
        </div>
      </div>
      <div className="px-3 pb-2">
        <svg aria-hidden="true" className="h-20 w-full" preserveAspectRatio="none" viewBox="0 0 300 75">
          <defs>
            <linearGradient id="mk-mock-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#b4f042" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#b4f042" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon fill="url(#mk-mock-fill)" points={`0,75 ${points.join(" ")} 300,75`} />
          <polyline
            fill="none"
            points={points.join(" ")}
            stroke="#b4f042"
            strokeLinejoin="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Clicks</th>
              <th>Conv.</th>
              <th className="max-sm:hidden">Revenue</th>
              <th className="max-sm:hidden">Cost</th>
              <th>ROI</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const value = roi(row.revenue, row.cost);
              return (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{number(row.clicks)}</td>
                  <td>{number(row.conv)}</td>
                  <td className="max-sm:hidden">{money(row.revenue)}</td>
                  <td className="max-sm:hidden">{money(row.cost)}</td>
                  <td className={value >= 0 ? "mk-pos" : "mk-neg"}>
                    {value >= 0 ? "+" : "−"}
                    {Math.abs(value).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <figcaption className="border-t border-[#1f1f23] px-3 py-2 text-[11px] text-[#8d8d8a]">Sample data</figcaption>
    </figure>
  );
}

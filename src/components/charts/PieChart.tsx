import React from 'react';
// import Chart from "react-apexcharts";
import dynamic from 'next/dynamic';
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type ChartProps = {
  // using `interface` is also ok
  [x: string]: any;
};
type ChartState = {
  chartData: any[];
  chartOptions: any;
};

class PieChart extends React.Component<ChartProps, ChartState> {
  constructor(props: { chartData: any[]; chartOptions: any }) {
    super(props);

    this.state = {
      chartData: [],
      chartOptions: {},
    };
  }

  componentDidMount() {
    this.setState({
      chartData: this.props.chartData,
      chartOptions: this.props.chartOptions,
    });
  }

  render() {
    return (
      <Chart
        options={this.state.chartOptions}
        series={this.state.chartData}
        // ARCH-M05 F012：可选 type 透传（缺省保持模板原值 'pie'，既有消费方零影响）。
        // react-apexcharts 的 type prop 优先于 options.chart.type，而 apexcharts 仅在
        // chart.type==='donut' 时绘制中孔——Insight 受众构成 donut（V8）必须由此传入。
        type={this.props.type ?? 'pie'}
        width="100%"
        height="100%"
      />
    );
  }
}

export default PieChart;

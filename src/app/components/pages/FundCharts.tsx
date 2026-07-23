import React from 'react';
import {
  Area,
  AreaChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export const PortfolioAllocationDonut: React.FC<{
  data: { name: string; value: number }[];
  colors: string[];
}> = ({ data, colors }) => (
  <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={22} innerRadius={10} strokeWidth={1}>
        {data.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
      </Pie>
    </PieChart>
  </ResponsiveContainer>
);

export const PortfolioEquityChart: React.FC<{
  data: { date: string; portfolio: number }[];
  isPositive: boolean;
}> = ({ data, isPositive }) => {
  const color = isPositive ? '#ef4444' : '#22c55e';
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 16, left: 4 }}>
        <defs>
          <linearGradient id="portfolio-equity-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.12} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} tick={{ fontSize: 9, fill: '#94a3b8' }} width={35} axisLine={false} tickLine={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 8, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(date: string) => {
            if (!date) return '';
            const parts = date.split('-');
            return parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : date;
          }}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0', padding: '6px 10px' }}
          formatter={(value: number) => [`${value.toFixed(2)}%`, '组合收益']}
          labelFormatter={(label: unknown) => {
            const value = String(label ?? '');
            const parts = value.split('-');
            return parts.length >= 3 ? `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日` : value;
          }}
        />
        <Area type="monotone" dataKey="portfolio" stroke={color} fill="url(#portfolio-equity-gradient)" strokeWidth={2} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export const FundComparisonChart: React.FC<{
  data: Record<string, string | number>[];
  fundNames: string[];
  colors: string[];
}> = ({ data, fundNames, colors }) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data}>
      <XAxis dataKey="date" hide />
      <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} tick={{ fontSize: 10 }} width={40} />
      <Tooltip
        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
        formatter={(value: number, name: string) => {
          const index = parseInt(name.replace('fund', ''));
          return [`${value.toFixed(2)}%`, fundNames[index] || name];
        }}
      />
      {fundNames.map((name, index) => (
        <Line
          key={name}
          type="monotone"
          dataKey={`fund${index}`}
          stroke={colors[index]}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  </ResponsiveContainer>
);

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

export const ChartRenderer = ({ type, data, config }: { type: string, data: any[], config?: any }) => {
  if (!data || data.length === 0) return null;
  const colors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

  const renderChart = () => {
    switch (type) {
      case 'bar_chart':
      case 'horizontal_bar_chart':
        return (
          <BarChart data={data}>
            <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      case 'line_chart':
      case 'area_chart':
      case 'spline_chart':
        return (
          <LineChart data={data}>
            <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        );
      case 'pie_chart':
      case 'donut_chart':
        return (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={type === 'donut_chart' ? 60 : 0} outerRadius={80} paddingAngle={2}>
              {data.map((_, i) => <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        );
      default:
        return <div className="text-sm text-slate-500">Unsupported chart: {type}</div>;
    }
  };

  return (
    <div className="h-64 w-full mt-4 bg-slate-50 rounded-lg p-2 border border-slate-100">
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

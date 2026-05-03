import { CloudSun, Sun } from 'lucide-react';

export default function WeatherIcon({ condition = 'partly', size = 44, className = '' }) {
  if (condition.toLowerCase().includes('clear')) return <Sun size={size} strokeWidth={1.7} className={className} />;
  return <CloudSun size={size} strokeWidth={1.7} className={className} />;
}

import { useQuery } from '@tanstack/react-query';
import { fetchWeather, WeatherData } from '../api/weather';
import { useSettings } from './useSettings';

export function useWeather() {
  const { data: settings } = useSettings();
  const location = settings?.weatherLocation || '';
  const units = settings?.weatherUnits || 'imperial';

  return useQuery<WeatherData>({
    queryKey: ['weather', location, units],
    queryFn: () => fetchWeather(location, units),
    enabled: !!location,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

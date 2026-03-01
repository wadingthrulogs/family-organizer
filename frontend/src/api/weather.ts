import { api } from './client';

export interface CurrentWeather {
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  icon: string;
  description: string;
  high: number;
  low: number;
}

export interface DailyForecast {
  date: string;
  high: number;
  low: number;
  icon: string;
  description: string;
}

export interface WeatherData {
  location: string;
  units: string;
  current: CurrentWeather;
  daily: DailyForecast[];
}

export async function fetchWeather(location: string, units: string = 'imperial'): Promise<WeatherData> {
  const { data } = await api.get<WeatherData>('/weather', {
    params: { location, units },
  });
  return data;
}

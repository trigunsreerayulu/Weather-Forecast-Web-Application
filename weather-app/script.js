const API_BASE = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_GEOCODING_BASE = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

const searchForm = document.querySelector('#search-form');
const citySearch = document.querySelector('#city-search');
const locationButton = document.querySelector('#location-button');
const statusMessage = document.querySelector('#status-message');
const currentWeather = document.querySelector('#current-weather');
const unitButtons = document.querySelectorAll('.unit-button');

let selectedUnit = 'celsius';
let currentWeatherData = null;
let activeRequest = null;

// Map Open-Meteo's weather codes to short, human-readable descriptions.
function describeWeather(code) {
  if (code === 0) return { label: 'Clear sky', theme: 'clear', icon: 'sun' };
  if (code === 1) return { label: 'Mainly clear', theme: 'clear', icon: 'partly' };
  if (code === 2) return { label: 'Partly cloudy', theme: 'cloudy', icon: 'partly' };
  if (code === 3) return { label: 'Overcast', theme: 'cloudy', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Foggy', theme: 'fog', icon: 'fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', theme: 'rain', icon: 'rain' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain showers', theme: 'rain', icon: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snowfall', theme: 'snow', icon: 'snow' };
  if (code === 95 || code === 96 || code === 99) return { label: 'Thunderstorm', theme: 'storm', icon: 'storm' };
  return { label: 'Variable conditions', theme: 'cloudy', icon: 'partly' };
}

// Build small inline weather illustrations so the app does not need an icon service.
function weatherIcon(type) {
  const sun = '<circle cx="38" cy="31" r="12" fill="#f3b94f"/><g stroke="#f3b94f" stroke-width="3" stroke-linecap="round"><path d="M38 10v-4M38 56v-4M17 31h-4M63 31h-4M23 16l-3-3M56 49l-3-3M53 16l3-3M20 49l3-3"/></g>';
  const moon = '<path d="M48 14a24 24 0 1 0 15 42A25 25 0 0 1 48 14Z" fill="#f3c86b" stroke="#e4ad4c" stroke-width="2" stroke-linejoin="round"/><circle cx="27" cy="20" r="1.5" fill="#a9c9d0"/><circle cx="62" cy="35" r="1.5" fill="#a9c9d0"/>';
  const cloud = '<path d="M24 52h30a12 12 0 0 0 1-24 18 18 0 0 0-34-1 13 13 0 0 0 3 25Z" fill="#fff" stroke="#9cc6ce" stroke-width="2" stroke-linejoin="round"/>';
  const rain = '<g stroke="#4d9fba" stroke-width="3" stroke-linecap="round"><path d="m28 57-3 7M41 57l-3 7M54 57l-3 7"/></g>';
  const snow = '<g stroke="#74b7ca" stroke-width="2" stroke-linecap="round"><path d="M28 59v9m-4-7 8 5m0-5-8 5M45 59v9m-4-7 8 5m0-5-8 5"/></g>';
  const storm = '<path d="m39 52-8 15h8l-2 11 13-18h-9l5-8" fill="#efb84e" stroke="#d99732" stroke-linejoin="round"/>';
  const fog = '<g stroke="#8daeb4" stroke-width="3" stroke-linecap="round"><path d="M18 56h45M23 64h37M29 72h28"/></g>';
  let artwork = '';
  if (type === 'sun') artwork = sun;
  if (type === 'moon') artwork = moon;
  if (type === 'partly') artwork = `<circle cx="31" cy="29" r="14" fill="#f3b94f"/><g stroke="#f3b94f" stroke-width="3" stroke-linecap="round"><path d="M31 7v-3M31 54v-3M9 29H6M56 29h-3M15 13l-2-2M49 47l-2-2M47 13l2-2"/></g>${cloud}`;
  if (type === 'cloud') artwork = cloud;
  if (type === 'rain') artwork = `${cloud}${rain}`;
  if (type === 'snow') artwork = `${cloud}${snow}`;
  if (type === 'storm') artwork = `${cloud}${storm}${rain}`;
  if (type === 'fog') artwork = `${cloud}${fog}`;
  return `<svg viewBox="0 0 76 78" xmlns="http://www.w3.org/2000/svg" focusable="false">${artwork}</svg>`;
}

// Convert Celsius to Fahrenheit before displaying the temperature.
function toFahrenheit(celsius) {
  return (celsius * 9 / 5) + 32;
}

// Format a Celsius reading with the temperature unit selected by the user.
function formatTemperature(value, includeUnit = true) {
  const converted = selectedUnit === 'fahrenheit' ? toFahrenheit(value) : value;
  const rounded = Math.round(converted);
  return includeUnit ? `${rounded}°` : String(rounded);
}

// Format wind speed as kilometers per hour or miles per hour.
function formatSpeed(kilometersPerHour) {
  const speed = selectedUnit === 'fahrenheit' ? kilometersPerHour / 1.60934 : kilometersPerHour;
  return `${Math.round(speed)} ${selectedUnit === 'fahrenheit' ? 'mph' : 'km/h'}`;
}

// Convert visibility to kilometers or miles to match the selected unit system.
function formatVisibility(meters) {
  const distance = selectedUnit === 'fahrenheit' ? meters / 1609.34 : meters / 1000;
  return `${distance.toFixed(1)} ${selectedUnit === 'fahrenheit' ? 'mi' : 'km'}`;
}

// Format a forecast date in the location's time zone.
function localDay(dateString, timezone, options = { weekday: 'short' }) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat('en', { ...options, timeZone: timezone }).format(date);
}

// Refresh every temperature and unit label without making another API request.
function updateUnitLabels() {
  if (!currentWeatherData) return;
  const { current, daily, timezone } = currentWeatherData;
  document.querySelector('#current-temperature').innerHTML = `${formatTemperature(current.temperature_2m, false)}<span>°</span>`;
  document.querySelector('#feels-like').innerHTML = `${formatTemperature(current.apparent_temperature, false)}<span>°</span>`;
  document.querySelector('#wind-speed').textContent = formatSpeed(current.wind_speed_10m);
  document.querySelector('#visibility').textContent = formatVisibility(current.visibility);
  document.querySelector('#high-low').innerHTML = `Today <span>H: ${formatTemperature(daily.temperature_2m_max[0])}</span><span>L: ${formatTemperature(daily.temperature_2m_min[0])}</span>`;
  renderForecast(daily, timezone);
}

// Draw the next five days from the daily forecast returned by the API.
function renderForecast(daily, timezone) {
  const forecastList = document.querySelector('#forecast-list');
  forecastList.innerHTML = daily.time.slice(0, 5).map((date, index) => {
    const conditions = describeWeather(daily.weather_code[index]);
    const label = index === 0 ? 'Today' : localDay(date, timezone);
    return `<article class="forecast-day" aria-label="${label}: ${conditions.label}, high ${formatTemperature(daily.temperature_2m_max[index])}, low ${formatTemperature(daily.temperature_2m_min[index])}">
      <span class="forecast-label">${label}</span>
      <span class="forecast-icon" aria-hidden="true">${weatherIcon(conditions.icon)}</span>
      <span class="forecast-condition">${conditions.label}</span>
      <span class="forecast-temps"><strong>${formatTemperature(daily.temperature_2m_max[index])}</strong><span>${formatTemperature(daily.temperature_2m_min[index])}</span></span>
    </article>`;
  }).join('');
}

// Put a successful API response into the current conditions and detail fields.
function renderWeather(data) {
  currentWeatherData = data;
  const { current, daily, timezone, location } = data;
  const conditions = describeWeather(current.weather_code);
  const icon = current.is_day === 0 && conditions.icon === 'sun' ? 'moon' : conditions.icon;
  const now = new Date(current.time);
  const dateText = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone }).format(now);

  document.querySelector('#location-name').textContent = location.name;
  document.querySelector('#current-date').textContent = dateText;
  document.querySelector('#current-condition').textContent = conditions.label;
  document.querySelector('#current-icon').innerHTML = weatherIcon(icon);
  document.querySelector('#sky-icon').innerHTML = weatherIcon(icon);
  document.querySelector('#sky-caption').textContent = `${conditions.label}, outside right now`;
  document.querySelector('#humidity').innerHTML = `${Math.round(current.relative_humidity_2m)}<span>%</span>`;
  document.querySelector('#pressure').innerHTML = `${Math.round(current.surface_pressure)}<span> hPa</span>`;
  document.querySelector('#updated-label').textContent = `Updated ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(now)}`;
  document.querySelector('#forecast-note').textContent = `Daily outlook for ${location.name}`;
  document.querySelector('#feels-hint').textContent = current.apparent_temperature < current.temperature_2m ? 'The breeze makes it feel cooler' : current.apparent_temperature > current.temperature_2m ? 'The air feels warmer than it is' : 'What it feels like outside';
  document.body.className = `weather-${conditions.theme}`;
  updateUnitLabels();
}

// Fetch JSON and turn HTTP errors into messages the app can display.
async function getJson(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 404 ? 'We could not find that place.' : 'The weather service is unavailable right now. Please try again.');
  return response.json();
}

// Load current conditions and five daily forecasts for a set of coordinates.
async function fetchForecast(latitude, longitude, location) {
  if (activeRequest) activeRequest.abort();
  activeRequest = new AbortController();
  const { signal } = activeRequest;
  currentWeather.setAttribute('aria-busy', 'true');
  locationButton.disabled = true;
  statusMessage.textContent = `Getting the latest weather for ${location.name}...`;
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,surface_pressure,wind_speed_10m,visibility',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: '5',
    timezone: 'auto'
  });

  try {
    const result = await getJson(`${API_BASE}?${params}`, signal);
    if (!result.current || !result.daily) throw new Error('Weather data was incomplete. Please try again.');
    renderWeather({ ...result, location });
    statusMessage.textContent = '';
  } catch (error) {
    if (error.name !== 'AbortError') {
      statusMessage.textContent = error instanceof TypeError ? 'We could not connect. Check your internet connection and try again.' : error.message;
    }
  } finally {
    if (activeRequest?.signal === signal) {
      currentWeather.setAttribute('aria-busy', 'false');
      locationButton.disabled = false;
    }
  }
}

// Find a city name, then load the forecast for its coordinates.
async function searchCity(city) {
  const controller = new AbortController();
  if (activeRequest) activeRequest.abort();
  activeRequest = controller;
  currentWeather.setAttribute('aria-busy', 'true');
  locationButton.disabled = true;
  statusMessage.textContent = `Looking up ${city.trim()}...`;
  try {
    const params = new URLSearchParams({ name: city.trim(), count: '1', language: 'en', format: 'json' });
    const result = await getJson(`${GEOCODING_BASE}?${params}`, controller.signal);
    if (!result.results?.length) throw new Error(`We could not find “${city.trim()}”. Check the spelling or try a nearby city.`);
    const place = result.results[0];
    await fetchForecast(place.latitude, place.longitude, {
      name: [place.name, place.admin1 && place.admin1 !== place.name ? place.admin1 : '', place.country_code].filter(Boolean).join(', '),
      latitude: place.latitude,
      longitude: place.longitude
    });
  } catch (error) {
    if (error.name !== 'AbortError') {
      statusMessage.textContent = error instanceof TypeError ? 'We could not connect. Check your internet connection and try again.' : error.message;
      currentWeather.setAttribute('aria-busy', 'false');
      locationButton.disabled = false;
    }
  }
}

// Ask permission for browser location and handle denied or unavailable results.
async function useCurrentLocation() {
  statusMessage.textContent = '';
  if (!('geolocation' in navigator)) {
    statusMessage.textContent = 'Location is not available in this browser. Search for a city instead.';
    return;
  }
  locationButton.disabled = true;
  statusMessage.textContent = 'Requesting your location permission...';
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    const { latitude, longitude } = coords;
    let name = 'Your location';
    try {
      const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), localityLanguage: 'en' });
      const place = await getJson(`${REVERSE_GEOCODING_BASE}?${params}`);
      name = place.city || place.locality || place.principalSubdivision || name;
      if (place.countryCode && name !== 'Your location') name += `, ${place.countryCode}`;
    } catch {
      name = `Your location (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`;
    }
    await fetchForecast(latitude, longitude, { name, latitude, longitude });
  }, (error) => {
    locationButton.disabled = false;
    if (error.code === error.PERMISSION_DENIED) statusMessage.textContent = 'Location permission was denied. Allow location access in your browser, or search for a city.';
    else if (error.code === error.POSITION_UNAVAILABLE) statusMessage.textContent = 'Your location could not be determined. Try again or search for a city.';
    else statusMessage.textContent = 'Location lookup took too long. Try again or search for a city.';
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const city = citySearch.value.trim();
  if (city) searchCity(city);
});

locationButton.addEventListener('click', useCurrentLocation);

unitButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectedUnit = button.dataset.unit;
    unitButtons.forEach((unitButton) => {
      const isSelected = unitButton === button;
      unitButton.classList.toggle('is-selected', isSelected);
      unitButton.setAttribute('aria-pressed', String(isSelected));
    });
    updateUnitLabels();
  });
});

// Start with a useful example city; visitors can search or use their location at any time.
fetchForecast(40.7128, -74.006, { name: 'New York, US', latitude: 40.7128, longitude: -74.006 });

(function () {
  'use strict'

  // 侧边栏导航（可自行修改链接与图标，图标使用 Font Awesome）
  var NAV_ITEMS = [
    { label: '主页', href: '/', icon: 'fa-house' },
    { label: '归档', href: '/archives/', icon: 'fa-box-archive' },
    { label: '分类', href: '/categories/', icon: 'fa-folder-open' },
    { label: '标签', href: '/tags/', icon: 'fa-tags' },
    { label: '关于', href: '/about/', icon: 'fa-circle-info' }
  ]

  // 未定位到城市时使用的默认城市
  var DEFAULT_LOCATION = { name: '上海市', latitude: 31.2304, longitude: 121.4737, source: 'default' }
  var LOCATION_LABELS = { gps: '精确定位', ip: '网络定位', manual: '手动位置', default: '默认位置' }
  var STORAGE_KEY = 'pblog:weather-location'

  function ready (fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn)
    } else {
      fn()
    }
  }

  function escapeHtml (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function readSavedLocation () {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (parsed && parsed.source === 'manual' && typeof parsed.name === 'string' &&
        isFinite(parsed.latitude) && isFinite(parsed.longitude)) {
        return parsed
      }
    } catch (e) { /* ignore */ }
    return null
  }

  function saveLocation (location) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(location))
    } catch (e) { /* ignore */ }
  }

  function clearSavedLocation () {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) { /* ignore */ }
  }

  // ---------------- Weather API (Open-Meteo / BigDataCloud) ----------------

  function buildReverseGeocodeUrl (coordinates) {
    var params = new URLSearchParams({ localityLanguage: 'zh' })
    if (coordinates) {
      params.set('latitude', String(coordinates.latitude))
      params.set('longitude', String(coordinates.longitude))
    }
    return 'https://api.bigdatacloud.net/data/reverse-geocode-client?' + params.toString()
  }

  function buildCitySearchUrl (query) {
    var params = new URLSearchParams({ name: query.trim(), count: '5', language: 'zh', format: 'json' })
    return 'https://geocoding-api.open-meteo.com/v1/search?' + params.toString()
  }

  function buildWeatherUrl (location) {
    var params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '2'
    })
    return 'https://api.open-meteo.com/v1/forecast?' + params.toString()
  }

  function getCondition (code) {
    if (code === 0) return { label: '晴朗', icon: 'fa-sun' }
    if (code === 1 || code === 2) return { label: '局部多云', icon: 'fa-cloud-sun' }
    if (code === 3) return { label: '阴天', icon: 'fa-cloud' }
    if (code === 45 || code === 48) return { label: '有雾', icon: 'fa-smog' }
    if (code >= 51 && code <= 57) return { label: '毛毛雨', icon: 'fa-cloud-rain' }
    if (code === 61 || code === 80) return { label: '小雨', icon: 'fa-cloud-rain' }
    if (code === 63 || code === 81) return { label: '中雨', icon: 'fa-cloud-showers-heavy' }
    if (code === 65 || code === 82 || code === 66 || code === 67) return { label: '大雨', icon: 'fa-cloud-showers-heavy' }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: '降雪', icon: 'fa-snowflake' }
    if (code >= 95) return { label: '雷暴', icon: 'fa-cloud-bolt' }
    return { label: '多云', icon: 'fa-cloud' }
  }

  function iconFor (condition, isDay) {
    if (!isDay && condition.icon === 'fa-sun') return 'fa-moon'
    if (!isDay && condition.icon === 'fa-cloud-sun') return 'fa-cloud-moon'
    return condition.icon
  }

  function getDeviceCoordinates () {
    if (!('geolocation' in navigator)) return Promise.resolve(null)
    return new Promise(function (resolve) {
      var settled = false
      var timer = window.setTimeout(function () { finish(null) }, 8000)
      function finish (coords) {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(coords)
      }
      navigator.geolocation.getCurrentPosition(
        function (position) { finish({ latitude: position.coords.latitude, longitude: position.coords.longitude }) },
        function () { finish(null) },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      )
    })
  }

  function reverseGeocode (source, coordinates) {
    return fetch(buildReverseGeocodeUrl(coordinates))
      .then(function (response) {
        if (!response.ok) throw new Error('Location request failed')
        return response.json()
      })
      .then(function (data) {
        var latitude = Number(data.latitude)
        var longitude = Number(data.longitude)
        var candidates = [data.city, data.locality, data.principalSubdivision]
        var name = null
        for (var i = 0; i < candidates.length; i++) {
          if (typeof candidates[i] === 'string' && candidates[i].trim()) { name = candidates[i].trim(); break }
        }
        if (!name || !isFinite(latitude) || !isFinite(longitude)) throw new Error('Incomplete location response')
        return { name: name, latitude: latitude, longitude: longitude, source: source }
      })
  }

  function resolveAutomaticLocation () {
    return getDeviceCoordinates().then(function (coordinates) {
      if (coordinates) {
        return reverseGeocode('gps', coordinates).catch(function () {
          return reverseGeocode('ip').catch(function () { return DEFAULT_LOCATION })
        })
      }
      return reverseGeocode('ip').catch(function () { return DEFAULT_LOCATION })
    })
  }

  function normalizeWeather (data, location) {
    if (!data.current || !data.hourly || !data.daily) throw new Error('Incomplete weather response')

    var currentCondition = getCondition(data.current.weather_code)
    var currentHour = data.current.time.slice(0, 13) + ':00'
    var currentIndex = data.hourly.time.indexOf(currentHour)

    var future = []
    for (var i = 0; i < data.hourly.time.length && future.length < 5; i++) {
      if (data.hourly.time[i] > currentHour) future.push(i)
    }

    var hourly = [{
      time: '现在',
      temperature: Math.round(data.current.temperature_2m),
      precipitationProbability: Math.round(data.hourly.precipitation_probability[currentIndex] || 0),
      isDay: data.current.is_day === 1,
      label: currentCondition.label,
      icon: currentCondition.icon
    }]

    future.forEach(function (index) {
      var condition = getCondition(data.hourly.weather_code[index])
      hourly.push({
        time: data.hourly.time[index].slice(11, 13) + '时',
        temperature: Math.round(data.hourly.temperature_2m[index]),
        precipitationProbability: Math.round(data.hourly.precipitation_probability[index] || 0),
        isDay: data.hourly.is_day[index] === 1,
        label: condition.label,
        icon: condition.icon
      })
    })

    return {
      city: location.name,
      locationSource: location.source,
      temperature: Math.round(data.current.temperature_2m),
      apparentTemperature: Math.round(data.current.apparent_temperature),
      humidity: Math.round(data.current.relative_humidity_2m),
      windSpeed: Math.round(data.current.wind_speed_10m),
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
      isDay: data.current.is_day === 1,
      label: currentCondition.label,
      icon: currentCondition.icon,
      hourly: hourly
    }
  }

  // ---------------- Templates ----------------

  function navCard () {
    var card = document.createElement('section')
    card.className = 'pb-card pb-nav'
    var items = NAV_ITEMS.map(function (item) {
      return '<a class="pb-nav__item" href="' + escapeHtml(item.href) + '">' +
        '<i class="fas ' + escapeHtml(item.icon) + '"></i>' +
        '<span>' + escapeHtml(item.label) + '</span>' +
        '</a>'
    }).join('')
    card.innerHTML = '<h3 class="pb-card__title">导航</h3><div class="pb-nav__list">' + items + '</div>'
    return card
  }

  function weatherCard () {
    var card = document.createElement('section')
    card.className = 'pb-card pb-weather'
    card.innerHTML = [
      '<span class="pb-weather__glow"></span>',
      '<header class="pb-weather__head">',
      '  <div class="pb-weather__city"><i class="fas fa-location-dot" data-pb="loc-icon"></i><h3 data-pb="city">定位中…</h3></div>',
      '  <button type="button" class="pb-weather__source" data-pb="openpicker">',
      '    <span data-pb="source">自动定位</span><i class="fas fa-chevron-down"></i>',
      '  </button>',
      '</header>',
      '<div class="pb-weather__now">',
      '  <div class="pb-weather__main">',
      '    <div class="pb-weather__temp"><span data-pb="temp">--</span><sup>°</sup></div>',
      '    <p class="pb-weather__label" data-pb="label">加载中</p>',
      '    <p class="pb-weather__range" data-pb="range">--</p>',
      '  </div>',
      '  <div class="pb-weather__icon"><i class="fas fa-cloud" data-pb="icon"></i></div>',
      '</div>',
      '<div class="pb-weather__hourly">',
      '  <p class="pb-weather__section">逐小时预报</p>',
      '  <div class="pb-weather__hours" data-pb="hours"></div>',
      '</div>',
      '<div class="pb-weather__metrics" data-pb="metrics"></div>',
      '<div class="pb-weather__picker" data-pb="picker" hidden>',
      '  <div class="pb-weather__picker-head">',
      '    <div><p class="pb-weather__picker-title">选择天气城市</p><p class="pb-weather__picker-sub">搜索后将保存到当前浏览器</p></div>',
      '    <button type="button" class="pb-weather__close" data-pb="close" aria-label="关闭城市选择">×</button>',
      '  </div>',
      '  <form class="pb-weather__search" data-pb="form">',
      '    <div class="pb-weather__search-box"><i class="fas fa-magnifying-glass"></i><input type="text" data-pb="input" placeholder="例如：杭州、深圳" aria-label="搜索城市"></div>',
      '    <button type="submit" data-pb="submit">搜索</button>',
      '  </form>',
      '  <div class="pb-weather__results" data-pb="results"></div>',
      '  <button type="button" class="pb-weather__restore" data-pb="restore"><i class="fas fa-rotate-left"></i> 恢复自动定位</button>',
      '</div>'
    ].join('')
    return card
  }

  function calendarCard () {
    var now = new Date()
    var year = now.getFullYear()
    var month = now.getMonth()
    var today = now.getDate()
    var firstDay = new Date(year, month, 1).getDay()
    var daysInMonth = new Date(year, month + 1, 0).getDate()
    var monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    var weekDays = ['日', '一', '二', '三', '四', '五', '六']

    var cells = ''
    weekDays.forEach(function (day) {
      cells += '<div class="pb-cal__weekday">' + day + '</div>'
    })
    var slot
    for (slot = 0; slot < firstDay; slot++) cells += '<div class="pb-cal__day is-empty"></div>'
    for (var day = 1; day <= daysInMonth; day++) {
      cells += '<div class="pb-cal__day' + (day === today ? ' is-today' : '') + '">' + day + '</div>'
    }

    var card = document.createElement('section')
    card.className = 'pb-card pb-cal'
    card.innerHTML = '<h3 class="pb-card__title">' + year + '年 ' + monthNames[month] + '</h3>' +
      '<div class="pb-cal__grid">' + cells + '</div>'
    return card
  }

  // ---------------- Weather rendering ----------------

  function query (card, name) {
    return card.querySelector('[data-pb="' + name + '"]')
  }

  function renderHourly (card, hourly) {
    query(card, 'hours').innerHTML = hourly.map(function (hour) {
      var showRain = hour.precipitationProbability >= 20
      return '<div class="pb-hour">' +
        '<span class="pb-hour__time' + (hour.time === '现在' ? ' is-now' : '') + '">' + escapeHtml(hour.time) + '</span>' +
        '<i class="fas ' + iconFor(hour, hour.isDay) + ' pb-hour__icon"></i>' +
        '<span class="pb-hour__temp">' + hour.temperature + '°</span>' +
        '<span class="pb-hour__rain' + (showRain ? '' : ' is-hidden') + '">' + hour.precipitationProbability + '%</span>' +
        '</div>'
    }).join('')
  }

  function renderMetrics (card, weather) {
    var metrics = [
      { icon: 'fa-temperature-half', label: '体感', value: weather.apparentTemperature + '°' },
      { icon: 'fa-droplet', label: '湿度', value: weather.humidity + '%' },
      { icon: 'fa-wind', label: '风速', value: weather.windSpeed + ' km/h' }
    ]
    query(card, 'metrics').innerHTML = metrics.map(function (item) {
      return '<div class="pb-metric">' +
        '<div class="pb-metric__label"><i class="fas ' + item.icon + '"></i><span>' + item.label + '</span></div>' +
        '<p class="pb-metric__value">' + escapeHtml(item.value) + '</p>' +
        '</div>'
    }).join('')
  }

  function applyWeather (card, weather) {
    query(card, 'city').textContent = weather.city
    query(card, 'source').textContent = LOCATION_LABELS[weather.locationSource] || '默认位置'
    query(card, 'loc-icon').className = 'fas ' + (weather.locationSource === 'gps' ? 'fa-location-crosshairs' : 'fa-location-dot')
    query(card, 'temp').textContent = weather.temperature
    query(card, 'label').textContent = weather.label
    query(card, 'range').textContent = '最高 ' + weather.high + '° · 最低 ' + weather.low + '°'
    query(card, 'icon').className = 'fas ' + iconFor(weather, weather.isDay)
    renderHourly(card, weather.hourly)
    renderMetrics(card, weather)
  }

  function loadWeather (card, location) {
    query(card, 'city').textContent = location.name
    return fetch(buildWeatherUrl(location))
      .then(function (response) {
        if (!response.ok) throw new Error('Weather request failed')
        return response.json()
      })
      .then(function (data) { applyWeather(card, normalizeWeather(data, location)) })
  }

  function refreshWeather (card) {
    var location = readSavedLocation()
    if (location) return loadWeather(card, location)
    return resolveAutomaticLocation().then(function (resolved) { return loadWeather(card, resolved) })
  }

  function setupPicker (card) {
    var picker = query(card, 'picker')
    var input = query(card, 'input')
    var results = query(card, 'results')
    var submit = query(card, 'submit')

    function open () { picker.hidden = false; input.focus() }
    function close () { picker.hidden = true }

    function search (event) {
      if (event) event.preventDefault()
      var term = input.value.trim()
      if (term.length < 2) { results.innerHTML = '<p class="pb-weather__msg">请输入至少两个字</p>'; return }
      submit.disabled = true
      submit.textContent = '搜索中'
      results.innerHTML = ''
      fetch(buildCitySearchUrl(term))
        .then(function (response) { return response.json() })
        .then(function (data) {
          var list = Array.isArray(data.results) ? data.results : []
          if (!list.length) { results.innerHTML = '<p class="pb-weather__msg">没有找到匹配城市</p>'; return }
          results.innerHTML = list.map(function (entry) {
            var name = entry.name || ''
            var detail = [entry.admin1, entry.country].filter(Boolean).join(' · ')
            var payload = JSON.stringify({ name: name, latitude: entry.latitude, longitude: entry.longitude, source: 'manual' })
            return '<button type="button" class="pb-weather__result" data-location="' + escapeHtml(payload) + '">' +
              '<span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(detail || '城市位置') + '</small></span>' +
              '<i class="fas fa-chevron-right"></i>' +
              '</button>'
          }).join('')
        })
        .catch(function () { results.innerHTML = '<p class="pb-weather__msg">城市搜索暂时不可用</p>' })
        .then(function () { submit.disabled = false; submit.textContent = '搜索' })
    }

    query(card, 'openpicker').addEventListener('click', open)
    query(card, 'close').addEventListener('click', close)
    query(card, 'restore').addEventListener('click', function () {
      clearSavedLocation()
      close()
      refreshWeather(card).catch(function () { /* keep old data */ })
    })
    query(card, 'form').addEventListener('submit', search)
    results.addEventListener('click', function (event) {
      var button = event.target.closest('.pb-weather__result')
      if (!button) return
      try {
        var location = JSON.parse(button.getAttribute('data-location'))
        saveLocation(location)
        close()
        loadWeather(card, location).catch(function () { /* keep old data */ })
      } catch (e) { /* ignore */ }
    })
  }

  // ---------------- Mount ----------------

  function mount () {
    var aside = document.getElementById('aside-content')
    if (!aside) return

    // 文章页保留主题自带的目录卡片，仅替换其余卡片
    var toc = aside.querySelector('#card-toc')

    aside.innerHTML = ''
    aside.appendChild(navCard())

    var weather = weatherCard()
    aside.appendChild(weather)
    setupPicker(weather)
    refreshWeather(weather).catch(function () {/* keep placeholders */})

    aside.appendChild(calendarCard())

    if (toc) {
      var tocSticky = document.createElement('div')
      tocSticky.className = 'sticky_layout'
      tocSticky.appendChild(toc)
      aside.appendChild(tocSticky)
    }
  }

  ready(mount)
  document.addEventListener('pjax:complete', mount)
})()

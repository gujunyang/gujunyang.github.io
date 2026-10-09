(function () {
  'use strict'

  var STORAGE_KEY = 'blog-music-player'
  var DEFAULT_VOLUME = 0.3

  var ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
  }

  function ready (fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn)
    } else {
      fn()
    }
  }

  function readState () {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
    } catch (e) {
      return {}
    }
  }

  function saveState (state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (e) { /* ignore */ }
  }

  function formatTime (seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0
    var m = Math.floor(seconds / 60)
    var s = Math.floor(seconds % 60)
    return m + ':' + (s < 10 ? '0' + s : s)
  }

  function template () {
    return [
      '<div class="bp-player__card">',
      '  <div class="bp-player__disc">',
      '    <img class="bp-player__cover" alt="" referrerpolicy="no-referrer">',
      '    <span class="bp-player__fallback">' + ICONS.music + '</span>',
      '    <span class="bp-player__hole"></span>',
      '  </div>',
      '  <div class="bp-player__info">',
      '    <p class="bp-player__title">未在播放</p>',
      '    <p class="bp-player__artist"></p>',
      '    <div class="bp-player__bar">',
      '      <span class="bp-player__time bp-player__time--cur">0:00</span>',
      '      <input class="bp-player__range" type="range" min="0" max="1000" value="0" aria-label="播放进度">',
      '      <span class="bp-player__time bp-player__time--dur">0:00</span>',
      '    </div>',
      '  </div>',
      '  <div class="bp-player__controls">',
      '    <button class="bp-player__btn bp-player__btn--play" type="button" aria-label="播放/暂停">' + ICONS.play + '</button>',
      '    <button class="bp-player__btn bp-player__btn--next" type="button" aria-label="下一首">' + ICONS.next + '</button>',
      '  </div>',
      '</div>'
    ].join('')
  }

  function init (list) {
    var state = readState()
    var index = typeof state.index === 'number' && state.index < list.length ? state.index : 0

    var audio = new Audio()
    audio.preload = 'auto'
    audio.volume = typeof state.volume === 'number' ? state.volume : DEFAULT_VOLUME

    var root = document.createElement('div')
    root.className = 'bp-player'
    root.innerHTML = template()
    document.body.appendChild(root)

    var card = root.querySelector('.bp-player__card')
    var disc = root.querySelector('.bp-player__disc')
    var cover = root.querySelector('.bp-player__cover')
    var titleEl = root.querySelector('.bp-player__title')
    var artistEl = root.querySelector('.bp-player__artist')
    var range = root.querySelector('.bp-player__range')
    var curEl = root.querySelector('.bp-player__time--cur')
    var durEl = root.querySelector('.bp-player__time--dur')
    var playBtn = root.querySelector('.bp-player__btn--play')
    var nextBtn = root.querySelector('.bp-player__btn--next')

    function current () {
      return list[index] || {}
    }

    function load (i, keepTime) {
      index = (i + list.length) % list.length
      var song = current()

      audio.src = song.url
      titleEl.textContent = song.name || '未知曲目'
      artistEl.textContent = song.artist || ''

      if (song.cover) {
        cover.src = song.cover
        cover.style.display = ''
        disc.classList.add('has-cover')
      } else {
        cover.removeAttribute('src')
        cover.style.display = 'none'
        disc.classList.remove('has-cover')
      }

      if (!keepTime) {
        range.value = 0
        curEl.textContent = '0:00'
      }
      durEl.textContent = '0:00'

      saveState({ index: index, volume: audio.volume })
    }

    function setPlaying (playing) {
      root.classList.toggle('is-playing', playing)
      playBtn.innerHTML = playing ? ICONS.pause : ICONS.play
      playBtn.setAttribute('aria-label', playing ? '暂停' : '播放')
    }

    function play () {
      var attempt = audio.play()
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(function () { /* blocked by autoplay policy */ })
      }
    }

    function toggle () {
      if (audio.paused) play()
      else audio.pause()
    }

    function next () {
      load(index + 1, false)
      play()
    }

    playBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      toggle()
    })
    nextBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      next()
    })

    range.addEventListener('input', function (e) {
      e.stopPropagation()
      if (isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = (Number(range.value) / 1000) * audio.duration
      }
    })

    audio.addEventListener('loadedmetadata', function () {
      durEl.textContent = formatTime(audio.duration)
    })
    audio.addEventListener('timeupdate', function () {
      if (isFinite(audio.duration) && audio.duration > 0) {
        range.value = Math.round((audio.currentTime / audio.duration) * 1000)
      }
      curEl.textContent = formatTime(audio.currentTime)
    })
    audio.addEventListener('play', function () { setPlaying(true) })
    audio.addEventListener('pause', function () { setPlaying(false) })
    audio.addEventListener('ended', function () { next() })
    audio.addEventListener('error', function () {
      console.warn('[music-player] 无法加载音频:', audio.src)
    })

    drag(card, root)

    load(index, false)
    setPlaying(false)

    var events = ['click', 'touchstart', 'pointerdown', 'keydown', 'wheel']
    var unlocked = false

    function unlock () {
      unlocked = true
      events.forEach(function (evt) {
        document.removeEventListener(evt, onInteract)
      })
    }

    function onInteract () {
      if (unlocked) return
      if (!audio.paused && audio.currentTime > 0) {
        unlock()
        return
      }
      play()
    }

    audio.addEventListener('play', unlock)
    events.forEach(function (evt) {
      document.addEventListener(evt, onInteract, { passive: true })
    })

    play()
  }

  function drag (card, root) {
    var startX = 0
    var startY = 0
    var originLeft = 0
    var originTop = 0
    var dragging = false
    var moved = false

    function onDown (e) {
      if (e.target.closest('.bp-player__btn, .bp-player__range')) return
      var rect = root.getBoundingClientRect()
      originLeft = rect.left
      originTop = rect.top
      startX = e.clientX
      startY = e.clientY
      dragging = true
      moved = false
      card.classList.add('is-dragging')
      if (card.setPointerCapture && e.pointerId != null) {
        try { card.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }
    }

    function onMove (e) {
      if (!dragging) return
      var dx = e.clientX - startX
      var dy = e.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return
      moved = true
      e.preventDefault()

      var width = root.offsetWidth
      var height = root.offsetHeight
      var left = Math.min(Math.max(0, originLeft + dx), window.innerWidth - width)
      var top = Math.min(Math.max(0, originTop + dy), window.innerHeight - height)

      root.style.left = left + 'px'
      root.style.top = top + 'px'
      root.style.right = 'auto'
      root.style.bottom = 'auto'
    }

    function onUp (e) {
      if (!dragging) return
      dragging = false
      card.classList.remove('is-dragging')
      if (card.releasePointerCapture && e.pointerId != null) {
        try { card.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }
    }

    card.addEventListener('pointerdown', onDown)
    card.addEventListener('pointermove', onMove)
    card.addEventListener('pointerup', onUp)
    card.addEventListener('pointercancel', onUp)
  }

  ready(function () {
    if (document.querySelector('.bp-player')) return

    fetch('/music/playlist.json')
      .then(function (res) {
        if (!res.ok) throw new Error('playlist not found')
        return res.json()
      })
      .then(function (list) {
        if (Array.isArray(list) && list.length > 0) init(list)
      })
      .catch(function (err) {
        console.warn('[music-player]', err.message)
      })
  })
})()

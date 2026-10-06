(function () {
  'use strict'

  var CONFIG = {
    autoplay: true,
    loop: 'all',
    order: 'random',
    volume: 0.5,
    theme: '#49b1f5',
    listFolded: true,
    listMaxHeight: '240px'
  }

  var STORAGE_KEY = 'blog-music-player'

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

  function init (list) {
    var state = readState()
    var startIndex = typeof state.index === 'number' && state.index < list.length ? state.index : 0

    var container = document.createElement('div')
    container.id = 'global-music-player'
    document.body.appendChild(container)

    var player = new APlayer({
      container: container,
      fixed: true,
      autoplay: CONFIG.autoplay,
      theme: CONFIG.theme,
      loop: CONFIG.loop,
      order: CONFIG.order,
      volume: typeof state.volume === 'number' ? state.volume : CONFIG.volume,
      preload: 'auto',
      listFolded: CONFIG.listFolded,
      listMaxHeight: CONFIG.listMaxHeight,
      mutex: true,
      audio: list
    })

    if (startIndex > 0 && player.list) {
      player.list.switch(startIndex)
    }

    player.on('listswitch', function (data) {
      saveState({ index: data.index, volume: player.audio.volume })
    })
    player.on('volumechange', function () {
      saveState({ index: player.list.index, volume: player.audio.volume })
    })

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
      if (!player.paused && player.audio.currentTime > 0) {
        unlock()
        return
      }
      player.play()
    }

    player.on('play', unlock)
    events.forEach(function (evt) {
      document.addEventListener(evt, onInteract, { passive: true })
    })

    var attempt = player.play()
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(function () { /* blocked by autoplay policy, wait for interaction */ })
    }
  }

  ready(function () {
    if (!window.APlayer) return

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

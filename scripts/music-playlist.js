'use strict'

const fs = require('fs')
const path = require('path')

const AUDIO_EXT = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac']
const COVER_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const LYRIC_EXT = ['.lrc', '.txt']

function walk (dir) {
  const result = []
  if (!fs.existsSync(dir)) return result
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) result.push(...walk(full))
    else result.push(full)
  }
  return result
}

function toUrl (hexo, full) {
  const rel = path.relative(hexo.source_dir, full).split(path.sep).join('/')
  return '/' + encodeURI(rel)
}

function baseKey (file) {
  return path.join(path.dirname(file), path.basename(file, path.extname(file)))
}

hexo.extend.generator.register('music_playlist', function () {
  const musicDir = path.join(hexo.source_dir, 'music')
  const files = walk(musicDir)

  const covers = {}
  const lyrics = {}
  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (COVER_EXT.includes(ext)) covers[baseKey(file)] = file
    if (LYRIC_EXT.includes(ext)) lyrics[baseKey(file)] = file
  }

  const playlist = files
    .filter(file => AUDIO_EXT.includes(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map(file => {
      const base = path.basename(file, path.extname(file))
      let artist = ''
      let name = base

      const parts = base.split(' - ')
      if (parts.length >= 2) {
        artist = parts[0].trim()
        name = parts.slice(1).join(' - ').trim()
      }

      const key = baseKey(file)
      const song = {
        name,
        artist,
        url: toUrl(hexo, file)
      }
      if (covers[key]) song.cover = toUrl(hexo, covers[key])
      if (lyrics[key]) song.lrc = toUrl(hexo, lyrics[key])
      return song
    })

  return {
    path: 'music/playlist.json',
    data: JSON.stringify(playlist)
  }
})

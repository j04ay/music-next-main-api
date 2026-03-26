/*
 * 该文件是运行在 Node.js 端的，获取数据的基本的思路就是后端代理，即提供接口路由供前端页面使用，然后在路由内部，我们接收到前端请求后，再发送 HTTP 请求到第三方服务接口，携带相应的请求参数，包括签名的参数字段等等。
 * 对于从第三方接口返回的数据，我们会做一层数据处理，最终提供给前端的数据前端可以直接使用，无需再处理。这样也比较符合真实企业项目的开发规范，即数据的处理放在后端做，前端只做数据渲染和交互。
 */
const axios = require('axios')
const _pinyinPkg = require('pinyin')
// pinyin@2 默认导出为函数；pinyin@4 为 { pinyin, default }。错误解构会导致 undefined，字母分组全部丢失只剩「热」
const pinyin = typeof _pinyinPkg === 'function' ? _pinyinPkg : _pinyinPkg.pinyin || _pinyinPkg.default
const Base64 = require('js-base64').Base64
// 获取签名方法
const getSecuritySign = require('../sign')

const ERR_OK = 0
const token = 5381
const QQ_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// 歌曲图片加载失败时使用的默认图片
const fallbackPicUrl = 'https://y.gtimg.cn/mediastyle/music_v11/extra/default_300x300.jpg?max_age=31536000'

// 公共参数
const commonParams = {
  g_tk: token,
  loginUin: 0,
  hostUin: 0,
  inCharset: 'utf8',
  outCharset: 'utf-8',
  notice: 0,
  needNewCode: 0,
  format: 'json',
  platform: 'yqq.json'
}

// 获取一个随机数值
function getRandomVal(prefix = '') {
  return prefix + (Math.random() + '').replace('0.', '')
}

// 获取一个随机 uid
function getUid() {
  const t = (new Date()).getUTCMilliseconds()
  return '' + Math.round(2147483647 * Math.random()) * t % 1e10
}

// 第三方接口常返回 http 图链，HTTPS 页面会报 Mixed Content；统一改为 https
function ensureHttpsUrl(url) {
  if (!url || typeof url !== 'string') return url
  if (url.indexOf('http://') === 0) return 'https://' + url.slice(7)
  return url
}

// 对 axios get 请求的封装
// 修改请求的 headers 值，合并公共请求参数
function get(url, params, axiosOptions) {
  return axios.get(url, {
    headers: {
      referer: 'https://y.qq.com/',
      origin: 'https://y.qq.com/',
      'User-Agent': QQ_BROWSER_UA
    },
    params: Object.assign({}, commonParams, params),
    ...axiosOptions
  })
}

// 对 axios post 请求的封装
// 修改请求的 headers 值
function post(url, params) {
  return axios.post(url, params, {
    headers: {
      referer: 'https://y.qq.com/',
      origin: 'https://y.qq.com/',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': QQ_BROWSER_UA
    }
  })
}

function parseMidListFromQuery(query) {
  let raw = query.mid
  if (raw === undefined && query['mid[]'] !== undefined) {
    raw = query['mid[]']
  }
  if (raw === undefined) {
    return []
  }
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr.filter((x) => x != null && String(x).length > 0)
}

// 处理歌曲列表
function handleSongList(list) {
  const songList = []

  list.forEach((item) => {
    const info = item.songInfo || item
    if (info.pay.pay_play !== 0 || !info.interval) {
      // 过滤付费歌曲和获取不到时长的歌曲
      return
    }

    // 构造歌曲的数据结构
    const song = {
      id: info.id,
      mid: info.mid,
      name: info.name,
      singer: mergeSinger(info.singer),
      url: '', // 在另一个接口获取
      duration: info.interval,
      pic: info.album.mid ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${info.album.mid}.jpg?max_age=2592000` : fallbackPicUrl,
      album: info.album.name
    }

    songList.push(song)
  })

  return songList
}

// 合并多个歌手的姓名
function mergeSinger(singer) {
  const ret = []
  if (!singer) {
    return ''
  }
  singer.forEach((s) => {
    ret.push(s.name)
  })
  return ret.join('/')
}

// 注册后端路由
function registerRouter(app) {
  registerRecommend(app)

  registerSingerList(app)

  registerSingerDetail(app)

  registerSongsUrl(app)

  registerLyric(app)

  registerAlbum(app)

  registerTopList(app)

  registerTopDetail(app)

  registerHotKeys(app)

  registerSearch(app)
}

// 注册推荐列表接口路由
function registerRecommend(app) {
  app.get('/api/getRecommend', (req, res) => {
    // 第三方服务接口 url
    const url = 'https://u.y.qq.com/cgi-bin/musics.fcg'

    // 构造请求 data 参数
    const data = JSON.stringify({
      comm: { ct: 24 },
      recomPlaylist: {
        method: 'get_hot_recommend',
        param: { async: 1, cmd: 2 },
        module: 'playlist.HotRecommendServer'
      },
      focus: { module: 'music.musicHall.MusicHallPlatform', method: 'GetFocus', param: {} }
    })

    // 随机数值
    const randomVal = getRandomVal('recom')
    // 计算签名值
    const sign = getSecuritySign(data)

    // 发送 get 请求
    get(url, {
      sign,
      '-': randomVal,
      data
    }).then((response) => {
      try {
        const data = response.data
        if (data.code === ERR_OK) {
          const focusList = data.focus?.data?.shelf?.v_niche?.[0]?.v_card
          const sliders = []
          if (focusList && Array.isArray(focusList)) {
            const jumpPrefixMap = {
              10002: 'https://y.qq.com/n/yqq/album/',
              10014: 'https://y.qq.com/n/yqq/playlist/',
              10012: 'https://y.qq.com/n/yqq/mv/v/'
            }
            const len = Math.min(focusList.length, 10)
            for (let i = 0; i < len; i++) {
              const item = focusList[i]
              if (!item) continue
              const sliderItem = { id: item.id, pic: ensureHttpsUrl(item.cover) }
              if (jumpPrefixMap[item.jumptype]) {
                sliderItem.link = jumpPrefixMap[item.jumptype] + (item.subid || item.id) + '.html'
              } else if (item.jumptype === 3001) {
                sliderItem.link = item.id
              }
              sliders.push(sliderItem)
            }
          }

          const albumList = data.recomPlaylist?.data?.v_hot
          const albums = []
          if (albumList && Array.isArray(albumList)) {
            for (let i = 0; i < albumList.length; i++) {
              const item = albumList[i]
              if (!item) continue
              albums.push({
                id: item.content_id,
                username: item.username,
                title: item.title,
                pic: ensureHttpsUrl(item.cover)
              })
            }
          }

          res.json({
            code: ERR_OK,
            result: { sliders, albums }
          })
        } else {
          res.json(data)
        }
      } catch (e) {
        console.warn('[getRecommend] 第三方 API 返回结构异常:', e.message)
        res.json({
          code: ERR_OK,
          result: { sliders: [], albums: [] }
        })
      }
    }).catch((e) => {
      console.warn('[getRecommend] 请求失败:', e.message)
      res.json({
        code: ERR_OK,
        result: { sliders: [], albums: [] }
      })
    })
  })
}

// 注册歌手列表接口路由
function registerSingerList(app) {
  app.get('/api/getSingerList', (req, res) => {
    const url = 'https://u.y.qq.com/cgi-bin/musics.fcg'
    const HOT_NAME = '热'

    const data = JSON.stringify({
      comm: { ct: 24, cv: 0 },
      singerList: {
        module: 'Music.SingerListServer',
        method: 'get_singer_list',
        param: { area: -100, sex: -100, genre: -100, index: -100, sin: 0, cur_page: 1 }
      }
    })

    const randomKey = getRandomVal('getUCGI')
    const sign = getSecuritySign(data)

    get(url, {
      sign,
      '-': randomKey,
      data
    }).then((response) => {
      try {
        const data = response.data
        if (data.code !== ERR_OK) {
          console.warn('[getSingerList] QQ code:', data.code)
          res.json({ code: ERR_OK, result: { singers: [] } })
          return
        }
        const singerList = data.singerList?.data?.singerlist
        if (!Array.isArray(singerList) || !singerList.length) {
          console.warn('[getSingerList] singerlist 为空或结构异常')
          res.json({ code: ERR_OK, result: { singers: [] } })
          return
        }

        // 构造歌手 Map 数据结构
        const singerMap = {
          hot: {
            title: HOT_NAME,
            list: map(singerList.slice(0, 10))
          }
        }

        singerList.forEach((item) => {
          try {
            const p = pinyin(item.singer_name)
            if (!p || !p.length || !p[0] || p[0][0] == null) {
              return
            }
            const key = String(p[0][0]).slice(0, 1).toUpperCase()
            if (!key) {
              return
            }
            if (!singerMap[key]) {
              singerMap[key] = {
                title: key,
                list: []
              }
            }
            singerMap[key].list.push(map([item])[0])
          } catch (e) {
            console.warn('[getSingerList] 单条歌手拼音分组跳过:', e.message)
          }
        })

        const hot = []
        const letter = []

        for (const k in singerMap) {
          const item = singerMap[k]
          if (item.title.match(/[a-zA-Z]/)) {
            letter.push(item)
          } else if (item.title === HOT_NAME) {
            hot.push(item)
          }
        }
        letter.sort((a, b) => a.title.charCodeAt(0) - b.title.charCodeAt(0))

        res.json({
          code: ERR_OK,
          result: {
            singers: hot.concat(letter)
          }
        })
      } catch (e) {
        console.warn('[getSingerList] 处理异常:', e.message)
        res.json({ code: ERR_OK, result: { singers: [] } })
      }
    }).catch((e) => {
      console.warn('[getSingerList] 请求失败:', e.message)
      res.json({ code: ERR_OK, result: { singers: [] } })
    })
  })

  // 做一层数据映射，构造单个 singer 数据结构
  function map(singerList) {
    return singerList.map((item) => {
      return {
        id: item.singer_id,
        mid: item.singer_mid,
        name: item.singer_name,
        pic: ensureHttpsUrl(item.singer_pic.replace(/\.webp$/, '.jpg').replace('150x150', '800x800'))
      }
    })
  }
}

// 注册歌手详情接口路由
function registerSingerDetail(app) {
  app.get('/api/getSingerDetail', (req, res) => {
    const url = 'https://u.y.qq.com/cgi-bin/musics.fcg'

    const data = JSON.stringify({
      comm: { ct: 24, cv: 0 },
      singerSongList: {
        method: 'GetSingerSongList',
        param: { order: 1, singerMid: req.query.mid, begin: 0, num: 100 },
        module: 'musichall.song_list_server'
      }
    })

    const randomKey = getRandomVal('getSingerSong')
    const sign = getSecuritySign(data)

    get(url, {
      sign,
      '-': randomKey,
      data
    }).then((response) => {
      const data = response.data
      if (data.code === ERR_OK) {
        const list = data.singerSongList.data.songList
        // 歌单详情、榜单详情接口都有类似处理逻辑，固封装成函数
        const songList = handleSongList(list)

        res.json({
          code: ERR_OK,
          result: {
            songs: songList
          }
        })
      } else {
        res.json(data)
      }
    })
  })
}

// 注册歌曲 url 获取接口路由
// 因为歌曲的 url 每天都在变化，所以需要单独的接口根据歌曲的 mid 获取
function registerSongsUrl(app) {
  app.get('/api/getSongsUrl', (req, res) => {
    const mid = parseMidListFromQuery(req.query)
    if (!mid.length) {
      res.json({ code: ERR_OK, result: { map: {} } })
      return
    }
    let midGroup = []
    // 第三方接口只支持最多处理 100 条数据，所以如果超过 100 条数据，我们要把数据按每组 100 条切割，发送多个请求
    if (mid.length > 100) {
      const groupLen = Math.ceil(mid.length / 100)
      for (let i = 0; i < groupLen; i++) {
        midGroup.push(mid.slice(i * 100, (100 * (i + 1))))
      }
    } else {
      midGroup = [mid]
    }

    // 以歌曲的 mid 为 key，存储歌曲 URL
    const urlMap = {}

    function mergeVkeyResponse(body) {
      try {
        const data = body
        if (!data || data.code !== ERR_OK || !data.req_0) {
          if (data) {
            console.warn('[getSongsUrl] QQ API code:', data.code, 'req_0:', !!data.req_0)
          }
          return
        }
        const midInfo = data.req_0.data && data.req_0.data.midurlinfo
        const sip = data.req_0.data && data.req_0.data.sip
        if (!midInfo || !sip || !sip.length) {
          console.warn('[getSongsUrl] midurlinfo/sip 为空, midInfo:', !!midInfo, 'sip:', sip?.length)
          return
        }
        const domain = sip[sip.length - 1]
        midInfo.forEach((info) => {
          if (info && info.songmid && info.purl) {
            urlMap[info.songmid] = domain + info.purl
          }
        })
      } catch (e) {
        console.warn('[getSongsUrl] 第三方 API 返回结构异常:', e.message)
      }
    }

    function postVkeyPayload(mids, loginflag, platform, songtypeFill) {
      if (!mids.length) {
        return Promise.resolve()
      }
      const data = {
        req_0: {
          module: 'vkey.GetVkeyServer',
          method: 'CgiGetVkey',
          param: {
            guid: getUid(),
            songmid: mids,
            songtype: new Array(mids.length).fill(songtypeFill),
            uin: '0',
            loginflag,
            platform,
            h5to: 'speed'
          }
        },
        comm: {
          g_tk: token,
          uin: '0',
          format: 'json',
          platform: 'h5',
          ct: 24,
          cv: 0
        }
      }
      const sign = getSecuritySign(JSON.stringify(data))
      const url = `https://u.y.qq.com/cgi-bin/musics.fcg?_=${getRandomVal()}&sign=${sign}`
      return post(url, data).then((response) => mergeVkeyResponse(response.data))
    }

    function process(midBatch) {
      return postVkeyPayload(midBatch, 1, '20', 1).then(() => {
        const missing = midBatch.filter((m) => !urlMap[m])
        return postVkeyPayload(missing, 0, '23', 0)
      })
    }

    // 构造多个 Promise 请求
    const requests = midGroup.map((mid) => {
      return process(mid)
    })

    // 并行发送多个请求
    return Promise.all(requests).then(() => {
      res.json({
        code: ERR_OK,
        result: {
          map: urlMap
        }
      })
    }).catch((e) => {
      console.warn('[getSongsUrl] 请求失败:', e.message)
      res.json({ code: ERR_OK, result: { map: {} } })
    })
  })
}

// 注册歌词接口
function registerLyric(app) {
  app.get('/api/getLyric', (req, res) => {
    const mids = parseMidListFromQuery(req.query)
    const songmid = mids[0]
    if (!songmid) {
      res.json({ code: ERR_OK, result: { lyric: '[00:00:00]缺少 song mid' } })
      return
    }
    const url = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg'

    get(
      url,
      {
        '-': 'MusicJsonCallback_lrc',
        pcachetime: +new Date(),
        songmid,
        g_tk_new_20200303: token
      },
      { responseType: 'text' }
    )
      .then((response) => {
        let raw = response.data
        let data = raw
        if (typeof raw === 'string') {
          const i = raw.indexOf('{')
          const j = raw.lastIndexOf('}')
          if (i !== -1 && j > i) {
            try {
              data = JSON.parse(raw.slice(i, j + 1))
            } catch (e) {
              console.warn('[getLyric] JSON 解析失败:', e.message)
            }
          }
        }
        if (data && data.code === ERR_OK && data.lyric != null) {
          res.json({
            code: ERR_OK,
            result: {
              lyric: Base64.decode(data.lyric)
            }
          })
        } else {
          res.json(
            data && typeof data === 'object'
              ? data
              : { code: -1, message: 'lyric parse failed' }
          )
        }
      })
      .catch((e) => {
        console.warn('[getLyric] 请求失败:', e.message)
        res.json({ code: ERR_OK, result: { lyric: '[00:00:00]歌词暂时无法获取' } })
      })
  })
}

// 注册歌单专辑接口
function registerAlbum(app) {
  app.get('/api/getAlbum', (req, res) => {
    const data = {
      req_0: {
        module: 'srf_diss_info.DissInfoServer',
        method: 'CgiGetDiss',
        param: {
          disstid: Number(req.query.id),
          onlysonglist: 1,
          song_begin: 0,
          song_num: 100
        }
      },
      comm: {
        g_tk: token,
        uin: '0',
        format: 'json',
        platform: 'h5'
      }
    }

    const sign = getSecuritySign(JSON.stringify(data))

    const url = `https://u.y.qq.com/cgi-bin/musics.fcg?_=${getRandomVal()}&sign=${sign}`

    post(url, data).then((response) => {
      const data = response.data
      if (data.code === ERR_OK) {
        const list = data.req_0.data.songlist
        const songList = handleSongList(list)

        res.json({
          code: ERR_OK,
          result: {
            songs: songList
          }
        })
      } else {
        res.json(data)
      }
    })
  })
}

// 注册排行榜接口
function registerTopList(app) {
  app.get('/api/getTopList', (req, res) => {
    const url = 'https://u.y.qq.com/cgi-bin/musics.fcg'

    const data = JSON.stringify({
      comm: { ct: 24 },
      toplist: { module: 'musicToplist.ToplistInfoServer', method: 'GetAll', param: {} }
    })

    const randomKey = getRandomVal('recom')
    const sign = getSecuritySign(data)

    get(url, {
      sign,
      '-': randomKey,
      data
    }).then((response) => {
      const data = response.data
      if (data.code === ERR_OK) {
        const topList = []
        const group = data.toplist.data.group

        group.forEach((item) => {
          item.toplist.forEach((listItem) => {
            topList.push({
              id: listItem.topId,
              pic: ensureHttpsUrl(listItem.frontPicUrl),
              name: listItem.title,
              period: listItem.period,
              songList: listItem.song.map((songItem) => {
                return {
                  id: songItem.songId,
                  singerName: songItem.singerName,
                  songName: songItem.title
                }
              })
            })
          })
        })

        res.json({
          code: ERR_OK,
          result: {
            topList
          }
        })
      } else {
        res.json(data)
      }
    })
  })
}

// 注册排行榜详情接口
function registerTopDetail(app) {
  app.get('/api/getTopDetail', (req, res) => {
    const url = 'https://u.y.qq.com/cgi-bin/musics.fcg'
    const { id, period } = req.query

    const data = JSON.stringify({
      detail: {
        module: 'musicToplist.ToplistInfoServer',
        method: 'GetDetail',
        param: {
          topId: Number(id),
          offset: 0,
          num: 100,
          period
        }
      },
      comm: {
        ct: 24,
        cv: 0
      }
    })

    const randomKey = getRandomVal('getUCGI')
    const sign = getSecuritySign(data)

    get(url, {
      sign,
      '-': randomKey,
      data
    }).then((response) => {
      try {
        const data = response.data
        if (data.code === ERR_OK) {
          const list = data.detail?.data?.songInfoList
          if (!list || !Array.isArray(list)) {
            res.json({
              code: ERR_OK,
              result: { songs: [] }
            })
            return
          }
          const songList = handleSongList(list)

          res.json({
            code: ERR_OK,
            result: {
              songs: songList
            }
          })
        } else {
          res.json(data)
        }
      } catch (e) {
        console.warn('[getTopDetail] 第三方 API 返回结构异常:', e.message)
        res.json({
          code: ERR_OK,
          result: { songs: [] }
        })
      }
    }).catch((e) => {
      console.warn('[getTopDetail] 请求失败:', e.message)
      res.json({
        code: ERR_OK,
        result: { songs: [] }
      })
    })
  })
}

// 热门搜索备用数据（当 QQ 音乐 API 失败时使用）
const FALLBACK_HOT_KEYS = [
  { key: '周杰伦', id: 1 },
  { key: '薛之谦', id: 2 },
  { key: '陈奕迅', id: 3 },
  { key: '邓紫棋', id: 4 },
  { key: '林俊杰', id: 5 },
  { key: ' Taylor Swift', id: 6 },
  { key: '毛不易', id: 7 },
  { key: '张杰', id: 8 },
  { key: '五月天', id: 9 },
  { key: '告五人', id: 10 }
]

// 注册热门搜索接口
function registerHotKeys(app) {
  app.get('/api/getHotKeys', (req, res) => {
    const url = 'https://c.y.qq.com/splcloud/fcgi-bin/gethotkey.fcg'

    get(url, {
      g_tk_new_20200303: token
    }).then((response) => {
      try {
        const data = response.data
        if (data.code === ERR_OK) {
          const hotkeyList = data.data?.hotkey
          const hotKeys = Array.isArray(hotkeyList)
            ? hotkeyList.map((key) => ({ key: key.k, id: key.n })).slice(0, 10)
            : FALLBACK_HOT_KEYS
          res.json({
            code: ERR_OK,
            result: { hotKeys }
          })
        } else {
          res.json({
            code: ERR_OK,
            result: { hotKeys: FALLBACK_HOT_KEYS }
          })
        }
      } catch (e) {
        console.warn('[getHotKeys] 第三方 API 返回结构异常:', e.message)
        res.json({
          code: ERR_OK,
          result: { hotKeys: FALLBACK_HOT_KEYS }
        })
      }
    }).catch((e) => {
      console.warn('[getHotKeys] 请求失败:', e.message, '- 使用备用数据')
      res.json({
        code: ERR_OK,
        result: { hotKeys: FALLBACK_HOT_KEYS }
      })
    })
  })
}

// 注册搜索查询接口
function registerSearch(app) {
  app.get('/api/search', (req, res) => {
    const url = 'https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp'

    const { query, page, showSinger } = req.query

    const data = {
      _: getRandomVal(),
      g_tk_new_20200303: token,
      w: query,
      p: page,
      perpage: 20,
      n: 20,
      zhidaqu: 1,
      catZhida: showSinger === 'true' ? 1 : 0,
      t: 0,
      flag: 1,
      ie: 'utf-8',
      sem: 1,
      aggr: 0,
      remoteplace: 'txt.mqq.all',
      uin: '0',
      needNewCode: 1,
      platform: 'h5',
      format: 'json'
    }

    get(url, data).then((response) => {
      try {
        const data = response.data
        if (data.code === ERR_OK) {
          const songList = []
          const songData = data.data?.song
          const list = songData?.list

          if (list && Array.isArray(list)) {
            list.forEach((item) => {
              const info = item
              if (!info) return
              const payPlay = info.pay?.payplay
              if (payPlay !== 0 || !info.interval) return

              const song = {
                id: info.songid,
                mid: info.songmid,
                name: info.songname,
                singer: mergeSinger(info.singer),
                url: '',
                duration: info.interval,
                pic: info.albummid ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${info.albummid}.jpg?max_age=2592000` : fallbackPicUrl,
                album: info.albumname
              }
              songList.push(song)
            })
          }

          let singer
          const zhida = data.data?.zhida
          if (zhida && zhida.type === 2) {
            singer = {
              id: zhida.singerid,
              mid: zhida.singermid,
              name: zhida.singername,
              pic: `https://y.gtimg.cn/music/photo_new/T001R800x800M000${zhida.singermid}.jpg?max_age=2592000`
            }
          }

          const curnum = songData?.curnum ?? 0
          const curpage = songData?.curpage ?? 1
          const totalnum = songData?.totalnum ?? 0
          const hasMore = 20 * (curpage - 1) + curnum < totalnum

          res.json({
            code: ERR_OK,
            result: {
              songs: songList,
              singer,
              hasMore
            }
          })
        } else {
          res.json(data)
        }
      } catch (e) {
        console.warn('[search] 第三方 API 返回结构异常:', e.message)
        res.json({
          code: ERR_OK,
          result: { songs: [], singer: null, hasMore: false }
        })
      }
    }).catch((e) => {
      console.warn('[search] 请求失败:', e.message)
      res.json({
        code: ERR_OK,
        result: { songs: [], singer: null, hasMore: false }
      })
    })
  })
}

module.exports = registerRouter

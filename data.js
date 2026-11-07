/* ============================================================
 * data.js —— 全站内容数据
 * 修改文案只需要改这里，不用动 index.html / project.html 的结构。
 * 「【待填】」表示内容留给罗娇后续补全，页面会原样展示占位提示。
 * ========================================================== */
window.SITE_DATA = {

  /* —— 首页 / B-612 星球 —— */
  home: {
    name: '罗娇',
    nameEn: 'LUOJIAO',
    slogan: '我是罗娇，在数智编程的星球上，用代码点亮我的玫瑰。',
    tags: ['数字经济2502'],
    // 五颗金色许愿星：按从左到右顺序对应五个板块，点击穿越星球前往
    meteors: [
      { key: 'about',      label: '关于我'     },
      { key: 'skills',     label: '能力'       },
      { key: 'experience', label: '经历与成绩' },
      { key: 'works',      label: '作品'       },
      { key: 'contact',    label: '联系'       }
    ]
  },

  /* —— 顶部导航（五个板块只从首页点星进入，导航只保留回星空）—— */
  nav: [
    { key: 'home', label: '星球首页' }
  ],

  /* —— 关于我（玫瑰星球）—— */
  about: {
    quote: '「我的星球上，有一朵我浇灌过的玫瑰。」',
    facts: [
      { k: '年龄',   v: '19 岁' },
      { k: '家乡',   v: '四川 · 遂宁' },
      { k: '学校',   v: '武汉理工大学 经济学院' },
      { k: '班级',   v: '数字经济 2502 班（大二在读）' },
      { k: '课程',   v: '《数智编程》结课作品' }
    ],
    intro: [
      '我从 Python 基础起步，这学期借着 AI 工具走进了 Vibecoding 的世界——学着用提示词描述想法，用 Trae 和 GitHub 把想法变成真正能跑的网页。',
      '比起"写完一段代码"，我更在意"做出一个有人愿意用的东西"。这个网站本身，就是我现阶段交出的答案。',
      '【待填：可以再补一两句你想让评审老师记住的话】'
    ],
    hobbies: [
      { name: '烹饪',       desc: '创意川菜，厨房是我的第二个实验室', icon: 'pot'    },
      { name: '欧美音乐',   desc: '耳机里的另一片星空',               icon: 'music'  },
      { name: '散步',       desc: '在自然里给大脑留白',               icon: 'leaf'   },
      { name: '麻将',       desc: '放松，也是和朋友们的社交场',       icon: 'tile'   }
    ]
  },

  /* —— 能力（数星星的商人星球）—— */
  skills: {
    quote: '「如果你驯服了我，我们就彼此需要了。」',
    // 熟练度 0~100，level 文案诚实标注「借助 AI 生成」与「独立编写」的区别
    groups: [
      {
        title: '编程与数据',
        items: [
          { name: 'HTML / CSS', level: '借助 AI 生成', pct: 60 },
          { name: 'JavaScript', level: '借助 AI 生成', pct: 55 },
          { name: 'Python',     level: '会用',         pct: 70 },
          { name: 'SQL',        level: '会用',         pct: 60 }
        ]
      },
      {
        title: '工具',
        items: [
          { name: 'Git / GitHub', level: '学习中', pct: 45 },
          { name: 'Trae',         level: '会用',   pct: 70 },
          { name: '提示词工程',   level: '会用',   pct: 75 },
          { name: '剪映',         level: '会用',   pct: 70 },
          { name: 'Photoshop',    level: '会用',   pct: 60 }
        ]
      },
      {
        title: '软技能',
        items: [
          { name: '写作', level: '独立输出', pct: 80 },
          { name: '演讲', level: '校赛一等奖', pct: 85 }
        ]
      },
      {
        title: '语言',
        items: [
          { name: '英语', level: '四级 552（已过）', pct: 75 }
        ]
      }
    ]
  },

  /* —— 经历与成绩（点灯人星球）—— */
  experience: {
    quote: '「你好。我点灯，你赶路。」',
    study: [
      { k: '大一 GPA', v: '3.789' },
      { k: '综合测评', v: '专业前 15%' },
      { k: '政治面貌', v: '共青团员' }
    ],
    courses: [
      { name: '数字经济专业导论', score: '97' },
      { name: '数字经济概论',     score: '94.5' },
      { name: '政治经济学',       score: '86.6' },
      { name: '微观经济学',       score: '80.84' },
      { name: '宏观经济学',       score: '76.4' }
    ],
    story: '高中时我擅长语文、英语和生化，高考语文 125 分；但物理成绩起伏很大，所以作为理科生的我没有选择工科。压线来到武理，遇见了现在的老师和同学——这一路不算完美，但我很珍惜。',
    honors: [
      { title: '自强杯演讲比赛',                 level: '校赛一等奖' },
      { title: '“爱在理工”红色剧本创作大赛',     level: '校优秀奖'   },
      { title: '商业精英挑战赛 · 品牌策划大赛',  level: '国家一等奖' }
    ],
    practice: [
      '学院自强社干事、宣传中心干事',
      '参与筹划「旧书圆新梦」公益活动与「经彩飞扬」晚会',
      '志愿服务累计 95 小时（义务家教、保护白海豚等）'
    ]
  },

  /* —— 作品星球（信封墙）—— */
  works: {
    quote: '「每一封信，都是我从一个星球寄出的问候。」',
    list: [
      {
        id: 'todo',
        no: '01',
        name: '星念待办',
        brief: '支持中文自然语言日期与重复规则的个人待办应用',
        tags: ['React', 'TypeScript'],
        status: '开发中',
        link: '', // 【待填】正式部署地址
        detail: {
          oneliner: '【待填：一句话定位】',
          why:      '【待填：为什么做这个项目】',
          role:     '【待填：我做了什么，独立 / 协作写清楚】',
          stack:    'React · TypeScript',
          shots:    [], // 【待填】截图路径数组，如 ['shots/todo-1.png']
          retro:    '【待填：复盘——卡最久的问题 + 怎么解决的】'
        }
      },
      {
        id: 'dino',
        no: '02',
        name: '像素小恐龙',
        brief: '复刻 Chrome 小恐龙的像素风跳跃小游戏',
        tags: ['HTML5 Canvas'],
        status: '开发中',
        link: '',
        detail: {
          oneliner: '【待填：一句话定位】',
          why:      '【待填：为什么做这个项目】',
          role:     '【待填：我做了什么】',
          stack:    'HTML5 Canvas · 原生 JS',
          shots:    [],
          retro:    '【待填：复盘】'
        }
      },
      {
        id: 'weather',
        no: '03',
        name: '天气助手',
        brief: '【待填：一句话简介】',
        tags: ['【待填】'],
        status: '设计中',
        link: '',
        detail: {
          oneliner: '【待填：一句话定位】',
          why:      '【待填】',
          role:     '【待填】',
          stack:    '【待填】',
          shots:    [],
          retro:    '【待填：复盘】'
        }
      },
      {
        id: 'study',
        no: '04',
        name: '智学伴侣',
        brief: '课程表与番茄钟整合的学习辅助小工具',
        tags: ['原生 JS', 'LocalStorage'],
        status: '开发中',
        link: '',
        detail: {
          oneliner: '【待填：一句话定位】',
          why:      '【待填】',
          role:     '【待填】',
          stack:    '原生 JS · LocalStorage',
          shots:    [],
          retro:    '【待填：复盘】'
        }
      },
      {
        id: 'pomodoro',
        no: '05',
        name: '番茄计时器',
        brief: '【待填：一句话简介】',
        tags: ['【待填】'],
        status: '设计中',
        link: '',
        detail: {
          oneliner: '【待填：一句话定位】',
          why:      '【待填】',
          role:     '【待填】',
          stack:    '【待填】',
          shots:    [],
          retro:    '【待填：复盘】'
        }
      },
      {
        id: 'notes',
        no: '06',
        name: '笔记助手',
        brief: '【待填：一句话简介】',
        tags: ['【待填】'],
        status: '设计中',
        link: '',
        detail: {
          oneliner: '【待填：一句话定位】',
          why:      '【待填】',
          role:     '【待填】',
          stack:    '【待填】',
          shots:    [],
          retro:    '【待填：复盘】'
        }
      }
    ]
  },

  /* —— 联系（页脚常驻）—— */
  contact: {
    email: '2263989218@qq.com',
    github: 'Ker0726',
    githubUrl: 'https://github.com/Ker0726',
    wechat: '【待填：微信号，可选择性展示】',
    closing: '「如果你也路过这颗星球，欢迎留下脚印。」'
  }
};

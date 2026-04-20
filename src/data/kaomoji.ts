// curated kaomoji — japanese-style unicode emoticons.
// each entry is tagged for search. tags are internal (no category ui);
// typing "bear", "flip", "happy", "magic" surfaces the right set.
//
// tag conventions:
//   - every animal entry has `animal` + species (bear, cat, bunny, dog)
//   - every happy/smile entry has `happy`
//   - every cry entry has `cry` + `sad`
//   - short mood aliases kept: cute, soft, wide, shy, shout, aww, wow

export type Kaomoji = { face: string; tags: readonly string[] }

export const KAOMOJI: readonly Kaomoji[] = [
  // ---------- happy / joy / laugh ----------
  { face: '(＾▽＾)',            tags: ['happy', 'smile'] },
  { face: '(´ ∀ ` *)',          tags: ['happy', 'smile', 'soft'] },
  { face: '(◡‿◡)',              tags: ['happy', 'smile', 'soft'] },
  { face: '(✿◠‿◠)',             tags: ['happy', 'flower', 'cute'] },
  { face: '(◕‿◕)',              tags: ['happy', 'cute'] },
  { face: '(◕ω◕✿)',             tags: ['happy', 'flower', 'cute'] },
  { face: '(｡◕‿◕｡)',            tags: ['happy', 'cute', 'wide'] },
  { face: '(●´∀`●)',            tags: ['happy', 'smile'] },
  { face: "(●'◡'●)",            tags: ['happy', 'smile', 'soft'] },
  { face: '٩(◕‿◕)۶',             tags: ['happy', 'cheer', 'hands'] },
  { face: '٩(^‿^)۶',             tags: ['happy', 'cheer', 'hands'] },
  { face: '٩(^ᴗ^)۶',             tags: ['happy', 'cheer'] },
  { face: '(*^▽^*)',            tags: ['happy', 'smile'] },
  { face: '(* ^ ω ^)',          tags: ['happy', 'soft'] },
  { face: '(*´ω｀*)',            tags: ['happy', 'soft', 'aww'] },
  { face: '(๑˃ᴗ˂)ﻭ',            tags: ['happy', 'fight', 'cheer'] },
  { face: '(๑•ᴗ•๑)',            tags: ['happy', 'cute'] },
  { face: '(｡ᵔᴗᵔ｡)',             tags: ['happy', 'cute', 'closed'] },
  { face: '(´꒳`)',              tags: ['happy', 'soft', 'cute'] },
  { face: '(⌒‿⌒)',              tags: ['happy', 'smile'] },
  { face: '(￣▽￣)',             tags: ['happy', 'grin'] },
  { face: '(❁´◡`❁)',            tags: ['happy', 'flower', 'cute'] },
  { face: '(≧◡≦)',              tags: ['happy', 'joy'] },
  { face: '(≧∀≦)',              tags: ['laugh', 'happy', 'joy'] },
  { face: '(*≧ω≦*)',             tags: ['laugh', 'happy', 'joy'] },
  { face: '＼(^o^)／',           tags: ['happy', 'cheer', 'hands'] },
  { face: '＼(￣▽￣)／',          tags: ['happy', 'cheer', 'hands'] },
  { face: 'ヽ(´▽`)/',            tags: ['happy', 'cheer'] },
  { face: '(◠‿◠)',              tags: ['happy', 'smile'] },
  { face: '٩(˘◡˘)۶',             tags: ['happy', 'cheer', 'hands'] },
  { face: '( ﾉ ﾟｰﾟ)ﾉ',           tags: ['happy', 'wave', 'hi'] },
  { face: '(≧∇≦)/',             tags: ['happy', 'joy', 'wave'] },
  { face: '(●´ω｀●)',             tags: ['happy', 'blush', 'soft'] },
  { face: '(˘ω˘)',              tags: ['happy', 'peaceful', 'soft'] },
  { face: '(*¯︶¯*)',             tags: ['happy', 'peaceful', 'blissful'] },
  { face: '(ಠ‿ಠ)',              tags: ['happy', 'smug', 'smirk'] },
  { face: '( ͡ᵔ ͜ʖ ͡ᵔ)',         tags: ['lenny', 'happy', 'smug'] },

  // ---------- magic / sparkle ----------
  { face: '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧',        tags: ['magic', 'sparkle', 'happy'] },
  { face: '✧*。(ᵕ̤ᴗᵕ̤)',          tags: ['magic', 'sparkle', 'happy'] },
  { face: '(☆▽☆)',              tags: ['sparkle', 'star', 'excited'] },
  { face: '(✧ω✧)',              tags: ['sparkle', 'star', 'excited'] },
  { face: '(★ω★)/',             tags: ['sparkle', 'star', 'excited'] },

  // ---------- love / hearts / kiss ----------
  { face: '(♡°▽°♡)',             tags: ['love', 'heart', 'happy'] },
  { face: '(♡˙︶˙♡)',             tags: ['love', 'heart', 'soft'] },
  { face: '(´♡‿♡`)',             tags: ['love', 'heart'] },
  { face: '(。♥‿♥。)',           tags: ['love', 'heart'] },
  { face: '♡(˘▽˘)♡',             tags: ['love', 'heart'] },
  { face: '(♡´▽｀♡)',             tags: ['love', 'heart'] },
  { face: '(ɔ◔‿◔)ɔ ♡',           tags: ['love', 'heart', 'hug'] },
  { face: '(´꒳`)♡',              tags: ['love', 'heart', 'soft'] },
  { face: '( ˘ ³˘)',             tags: ['love', 'kiss'] },
  { face: '( ˘ ³˘)♥',             tags: ['love', 'kiss', 'heart'] },
  { face: '(♡ω♡)',               tags: ['love', 'heart', 'smitten'] },
  { face: '(ღ˘⌣˘ღ)',             tags: ['love', 'heart'] },
  { face: '(♡∀♡)',               tags: ['love', 'heart'] },
  { face: 'ヽ(♡‿♡)ノ',           tags: ['love', 'heart', 'cheer'] },
  { face: '(*♡﹃♡*)',             tags: ['love', 'heart', 'want'] },
  { face: '(◍•ᴗ•◍)❤',            tags: ['love', 'heart', 'soft'] },
  { face: '(*˘︶˘*).:*♡',         tags: ['love', 'dreamy', 'heart'] },

  // ---------- sad / cry ----------
  { face: '(´；ω；`)',           tags: ['sad', 'cry'] },
  { face: '(ಥ_ಥ)',               tags: ['sad', 'cry'] },
  { face: '(ಥ﹏ಥ)',               tags: ['sad', 'cry'] },
  { face: '(T_T)',               tags: ['sad', 'cry'] },
  { face: '(T-T)',               tags: ['sad', 'cry'] },
  { face: '(;_;)',               tags: ['sad', 'cry'] },
  { face: '(ToT)',               tags: ['sad', 'cry'] },
  { face: '(╥﹏╥)',               tags: ['sad', 'cry'] },
  { face: '(◞‸◟)',               tags: ['sad', 'down'] },
  { face: '(｡•́︿•̀｡)',            tags: ['sad', 'pout'] },
  { face: '(っ- ‸ - ς)',         tags: ['sad', 'down'] },
  { face: '(´;ω;`)',             tags: ['sad', 'cry'] },
  { face: '(இ﹏இ`｡)',             tags: ['sad', 'cry'] },
  { face: '｡ﾟ(ﾟ´ω`ﾟ)ﾟ｡',         tags: ['sad', 'cry', 'sob'] },
  { face: '｡ﾟ(ﾟ´Д｀ﾟ)ﾟ｡',         tags: ['sad', 'cry', 'sob'] },
  { face: '(ಥ ͜ʖಥ)',              tags: ['sad', 'cry', 'lenny'] },
  { face: '(つω`｡)',              tags: ['sad', 'tired', 'rub'] },

  // ---------- angry / glare ----------
  { face: '(╬ Ò﹏Ó)',             tags: ['angry', 'mad'] },
  { face: '(ಠ_ಠ)',               tags: ['angry', 'glare', 'disapproval'] },
  { face: '(ಠ益ಠ)',               tags: ['angry', 'glare'] },
  { face: '(눈_눈)',               tags: ['angry', 'glare', 'side-eye'] },
  { face: '(눈‸눈)',               tags: ['angry', 'glare'] },
  { face: 'ლ(ಠ益ಠლ)',             tags: ['angry', 'rage', 'flip'] },
  { face: '(｀Д´)',               tags: ['angry', 'shout'] },
  { face: '(｀皿´)',               tags: ['angry', 'grit'] },
  { face: 'ヽ(｀Д´)ﾉ',            tags: ['angry', 'shout', 'arms'] },
  { face: '(#`д´)',               tags: ['angry'] },
  { face: '(￣^￣)',               tags: ['pout', 'angry'] },
  { face: '(¬_¬")',               tags: ['annoyed', 'side-eye'] },
  { face: '(；¬＿¬)',               tags: ['annoyed', 'side-eye'] },
  { face: '(︶︿︶)',               tags: ['pout', 'angry'] },
  { face: '(｡⇀‸↼‶)',              tags: ['angry', 'grr'] },

  // ---------- surprised / shock / wow ----------
  { face: '(⊙_⊙)',               tags: ['surprised', 'shock'] },
  { face: '(O_O)',               tags: ['surprised', 'shock'] },
  { face: '(°o°)',               tags: ['surprised', 'shock'] },
  { face: '(⊙▂⊙)',               tags: ['surprised', 'shock'] },
  { face: '(°ロ°) !',             tags: ['surprised', 'shock'] },
  { face: 'Σ(°△°|||)',            tags: ['surprised', 'shock'] },
  { face: 'Σ(O_O)',               tags: ['surprised', 'shock'] },
  { face: 'w(°o°)w',              tags: ['surprised', 'shock', 'wow'] },
  { face: 'ヽ(°〇°)ﾉ',            tags: ['surprised', 'shock'] },
  { face: '(゜o゜;',               tags: ['surprised', 'shock'] },
  { face: '(ʘᗩʘ)',               tags: ['surprised', 'shock'] },
  { face: '(ʘ_ʘ)',               tags: ['stare', 'surprised', 'wide'] },

  // ---------- animals: bears ----------
  { face: 'ʕ•ᴥ•ʔ',               tags: ['animal', 'bear', 'cute'] },
  { face: 'ʕ·ᴥ·ʔ',               tags: ['animal', 'bear'] },
  { face: 'ʕ◉ᴥ◉ʔ',               tags: ['animal', 'bear', 'surprised'] },
  { face: 'ʕ→ᴥ←ʔ',               tags: ['animal', 'bear'] },
  { face: 'ʕᴥ· ʔ',               tags: ['animal', 'bear', 'side'] },
  { face: 'ʕ •ᴥ•ʔ',              tags: ['animal', 'bear', 'cute'] },
  { face: 'ʕ≧ᴥ≦ʔ',               tags: ['animal', 'bear', 'happy'] },
  { face: 'ʕ·㉨·ʔ',               tags: ['animal', 'bear'] },
  { face: 'ʕ•̫͡•ʔ',              tags: ['animal', 'bear', 'cute'] },

  // ---------- animals: cats ----------
  { face: '(=^･ω･^=)',            tags: ['animal', 'cat', 'cute'] },
  { face: '(=^‥^=)',              tags: ['animal', 'cat'] },
  { face: '(=^･ｪ･^=)',            tags: ['animal', 'cat'] },
  { face: 'ฅ^•ﻌ•^ฅ',              tags: ['animal', 'cat', 'cute', 'paws'] },
  { face: 'ฅ(• ɪ •)ฅ',            tags: ['animal', 'cat', 'cute', 'paws'] },
  { face: 'ฅ(ΦωΦ)ฅ',              tags: ['animal', 'cat'] },
  { face: '૮・ﻌ・ა',              tags: ['animal', 'cat', 'cute'] },
  { face: '(^◔ᴥ◔^)',              tags: ['animal', 'cat'] },
  { face: '(ㅇㅅㅇ❀)',             tags: ['animal', 'cat', 'cute', 'flower'] },

  // ---------- animals: bunnies, dogs ----------
  { face: '(\\(=ˊωˋ=)/)',         tags: ['animal', 'bunny', 'cute'] },
  { face: '(\\( ⁰⊖⁰)/)',          tags: ['animal', 'bunny'] },
  { face: '(･ᴗ･)',                tags: ['animal', 'bunny', 'cute'] },
  { face: '(˵˃ ᆺ ˂˵)',            tags: ['animal', 'bunny', 'cute'] },
  { face: 'U・ᴥ・U',               tags: ['animal', 'dog', 'cute'] },
  { face: 'U ´꓃ ` U',              tags: ['animal', 'dog'] },
  { face: 'ʢ•̫͡•ʡ',                tags: ['animal', 'dog'] },

  // ---------- lenny / smug ----------
  { face: '( ˵ ͡° ͜ʖ ͡°˵ )',      tags: ['lenny', 'smug', 'mischief'] },
  { face: '( ͡° ͜ʖ ͡°)',           tags: ['lenny', 'smug', 'mischief'] },
  { face: '( ͠° ͟ʖ ͡°)',           tags: ['lenny', 'smug'] },
  { face: '( ≖ ͜ʖ≖)',              tags: ['lenny', 'smug'] },

  // ---------- cool / deal-with-it ----------
  { face: '(⌐■_■)',                tags: ['cool', 'shades', 'deal'] },
  { face: '( •_•)>⌐■-■',            tags: ['cool', 'shades', 'deal'] },
  { face: '(•̀_•́ˇ)',              tags: ['cool', 'confident'] },
  { face: '(—‿‿—)',                tags: ['cool', 'confident'] },
  { face: '(≖_≖)',                 tags: ['smug', 'suspicious'] },
  { face: '(｡◕‿‿◕｡)',              tags: ['happy', 'wide', 'cute'] },
  { face: '(✖╭╮✖)',                tags: ['dead', 'x', 'ko'] },

  // ---------- shrug / flip / flex / fight ----------
  { face: '¯\\_(ツ)_/¯',            tags: ['shrug', 'idk', 'dunno'] },
  { face: '¯\\_(⊙_ʖ⊙)_/¯',          tags: ['shrug', 'idk', 'confused'] },
  { face: '¯\\_(ʘ‿ʘ)_/¯',           tags: ['shrug', 'idk', 'awkward'] },
  { face: '(╯°□°)╯︵ ┻━┻',          tags: ['flip', 'angry', 'rage', 'table'] },
  { face: '(┛◉Д◉)┛彡┻━┻',           tags: ['flip', 'angry', 'rage', 'table'] },
  { face: '┻━┻ ︵ \\(°□°)/ ︵ ┻━┻',  tags: ['flip', 'rage', 'double', 'table'] },
  { face: '┬─┬ノ( º _ ºノ)',        tags: ['unflip', 'calm', 'table'] },
  { face: '(ง ͠° ͟ل͜ ͡°)ง',          tags: ['fight', 'rage', 'come-at-me'] },
  { face: 'ᕙ(`▿´)ᕗ',                tags: ['flex', 'strong', 'muscle'] },
  { face: 'ᕦ(ò_óˇ)ᕤ',               tags: ['flex', 'strong', 'muscle'] },
  { face: '୧(๑•̀⌄•́๑)૭',            tags: ['fight', 'cheer', 'strong'] },

  // ---------- dance / wave / action / hug ----------
  { face: '\\(^▽^)/',               tags: ['happy', 'cheer', 'wave'] },
  { face: '♪♪ ヽ(ˇ∀ˇ )ゞ',           tags: ['dance', 'music', 'happy'] },
  { face: '♫(◠‿◠)♪',                tags: ['dance', 'music', 'happy'] },
  { face: '┏(＾0＾)┛┗(＾0＾)┓',        tags: ['dance', 'music'] },
  { face: '☜(ﾟヮﾟ☜)',                tags: ['point', 'left'] },
  { face: '(☞ﾟヮﾟ)☞',                tags: ['point', 'right'] },
  { face: '(•̀ᴗ•́)و',                tags: ['fight', 'cheer'] },
  { face: '( •_•)',                  tags: ['neutral', 'stare'] },
  { face: '(づ｡◕‿‿◕｡)づ',             tags: ['hug', 'love'] },
  { face: '(ノ_<。)ヾ(´ ▽ ` )',       tags: ['comfort', 'hug'] },
  { face: 'ᕕ( ᐛ )ᕗ',                tags: ['run', 'happy', 'go'] },
  { face: '≧◠‿◠≦✌',                 tags: ['peace', 'happy', 'victory'] },
  { face: '(っ˘̩╭╮˘̩)っ',            tags: ['hug', 'sad', 'comfort'] },

  // ---------- dead / tired / sleep ----------
  { face: '(x_x)',                  tags: ['dead', 'ko', 'x'] },
  { face: '(×_×)',                  tags: ['dead', 'ko', 'x'] },
  { face: '(-_-)',                  tags: ['tired', 'done'] },
  { face: '(－_－)',                 tags: ['tired', 'done'] },
  { face: '( ˘︹˘ )',                tags: ['tired', 'sad'] },
  { face: '(-_-;)',                 tags: ['tired', 'sweat', 'awkward'] },
  { face: '(´-ω-`)',                tags: ['tired', 'sleepy'] },
  { face: '(＿ ＿*)Z z z',           tags: ['sleep', 'tired'] },
  { face: '(－.－)...zzZ',            tags: ['sleep', 'tired'] },
  { face: '(-, – …)。o',              tags: ['sleep', 'tired'] },

  // ---------- mischief / sneaky / suspicious ----------
  { face: 'ψ(｀∇´)ψ',               tags: ['mischief', 'evil', 'sneaky'] },
  { face: '(¬‿¬ )',                 tags: ['sneaky', 'smirk', 'mischief'] },
  { face: '(¬‿¬)',                  tags: ['sneaky', 'smirk', 'mischief'] },
  { face: '(￢з￢)',                 tags: ['whistle', 'sneaky'] },
  { face: '(◔_◔)',                 tags: ['side-eye', 'suspicious'] },
  { face: '(¬▂¬)',                  tags: ['suspicious', 'squint'] },
  { face: '(¬_¬)',                  tags: ['unamused', 'side-eye'] },
  { face: '(; ･_･)',                tags: ['awkward', 'sweat'] },
  { face: '(◉_◉)',                  tags: ['stare', 'wide'] },

  // ---------- apology / bow / defeat ----------
  { face: 'm(_ _)m',                tags: ['apology', 'sorry', 'bow'] },
  { face: '(_ _).oO',               tags: ['apology', 'sleep', 'bow'] },
  { face: '(ᴗ_ᴗ)',                  tags: ['apology', 'bow', 'sorry'] },
  { face: 'orz',                    tags: ['defeat', 'bow', 'despair'] },
  { face: 'OTL',                    tags: ['defeat', 'bow', 'despair'] },

  // ---------- confused / awkward ----------
  { face: '(・_・ヾ',               tags: ['confused', 'uncertain'] },
  { face: '(´･_･`)',                tags: ['confused', 'uncertain'] },
  { face: '(◎_◎;)',                 tags: ['confused', 'sweat'] },
  { face: '( ︶︿︶)_╭∩╮',             tags: ['dismiss', 'angry', 'flip-off'] },
  { face: '( ͡° ʖ̯ ͡°)',              tags: ['ugh', 'done', 'annoyed'] },
  { face: '(￣﹏￣；)',                tags: ['awkward', 'sweat'] },

  // ---------- blush / shy / wink / misc friendly ----------
  { face: '(￣ー￣)ゞ',               tags: ['salute', 'ok'] },
  { face: '(-‿◦)',                  tags: ['wink', 'smile'] },
  { face: '(^_~)',                  tags: ['wink'] },
  { face: '(*^‿^*)',                tags: ['happy', 'blush'] },
  { face: '(//▽//)',                tags: ['blush', 'shy'] },
  { face: '(〃ω〃)',                 tags: ['blush', 'shy'] },
  { face: '(*/▽＼*)',                tags: ['blush', 'shy'] },
  { face: '(⺣◡⺣)♡*',                tags: ['love', 'blush', 'dreamy'] },

  // ---------- hello / bye / wave ----------
  { face: '( ´ ▽ ` )ﾉ',              tags: ['wave', 'hi', 'hello'] },
  { face: '(￣▽￣)ノ',                 tags: ['wave', 'bye'] },
  { face: '( ･ω･)ﾉ',                 tags: ['wave', 'hi'] },
  { face: '(^_^)/',                   tags: ['wave', 'hi'] },
  { face: 'ヾ(・ω・*)',               tags: ['wave', 'hi'] },
  { face: 'バイバイ ヾ(＾∇＾)',          tags: ['wave', 'bye'] },

  // ---------- music / sparkle / misc ----------
  { face: '(ᗒᗣᗕ)՞',                 tags: ['sad', 'cry', 'dramatic'] },
  { face: '(ᵔᴥᵔ)',                  tags: ['animal', 'bear', 'happy'] },
]

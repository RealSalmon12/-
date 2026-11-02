// 바코: BacoClass 의 바다코끼리 캐릭터 (로그인 화면, 아이콘과 같은 모양). 겨울이라 목도리를 둘렀음
export default function Baco({ size = 160, className = '', title }) {
  return (
    <svg className={className} viewBox="0 0 240 210" width={size} height={size * 210 / 240}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M74 104C56 140 50 176 62 196Q120 206 178 196C190 176 184 140 166 104Z" fill="#a8705a" />
      <path d="M90 150Q120 124 150 150C156 170 156 186 148 198Q120 202 92 198C84 186 84 170 90 150Z" fill="#c08a72" />
      <ellipse cx="66" cy="194" rx="26" ry="10" transform="rotate(-14 66 194)" fill="#93604c" />
      <ellipse cx="174" cy="194" rx="26" ry="10" transform="rotate(14 174 194)" fill="#93604c" />
      <ellipse cx="120" cy="78" rx="56" ry="50" fill="#a8705a" />
      <ellipse cx="98" cy="62" rx="5.5" ry="7" fill="#2a1d18" />
      <ellipse cx="142" cy="62" rx="5.5" ry="7" fill="#2a1d18" />
      <circle cx="100" cy="59" r="2" fill="#fff" />
      <circle cx="144" cy="59" r="2" fill="#fff" />
      <ellipse cx="84" cy="80" rx="8" ry="5" fill="#e98f86" opacity=".55" />
      <ellipse cx="156" cy="80" rx="8" ry="5" fill="#e98f86" opacity=".55" />
      <path d="M68 114Q120 138 172 114L174 130Q120 156 66 130Z" fill="#c4443f" />
      <path d="M72 121Q120 144 168 121" stroke="#f3dcc6" strokeWidth="3" fill="none" strokeDasharray="7 6" />
      <path d="M78 126L72 168Q84 172 94 168L96 132Z" fill="#b23b37" />
      <path d="M73 160Q83 164 93 160M74 150Q84 154 94 150" stroke="#f3dcc6" strokeWidth="3" fill="none" />
      <g fill="#f6ecd4" stroke="#7c5444" strokeWidth="2" strokeLinejoin="round">
        <path d="M106 100C104 120 100 138 98 150C97 155 103 156 104 151C108 136 112 118 114 102Z" />
        <path d="M134 100C136 120 140 138 142 150C143 155 137 156 136 151C132 136 128 118 126 102Z" />
      </g>
      <circle cx="107" cy="92" r="17" fill="#d6a68c" />
      <circle cx="133" cy="92" r="17" fill="#d6a68c" />
      <g fill="#7c5444">
        <circle cx="98" cy="90" r="1.6" /><circle cx="104" cy="96" r="1.6" /><circle cx="96" cy="98" r="1.6" /><circle cx="110" cy="101" r="1.6" />
        <circle cx="142" cy="90" r="1.6" /><circle cx="136" cy="96" r="1.6" /><circle cx="144" cy="98" r="1.6" /><circle cx="130" cy="101" r="1.6" />
      </g>
      <ellipse cx="120" cy="78" rx="9" ry="6" fill="#4a302a" />
    </svg>
  )
}

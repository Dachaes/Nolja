// 앞뒤 공백을 제거하고, 조합형/완성형 등 같은 글자의 다른 유니코드 표현을 통일합니다.
// 예를 들어 분리된 한글 자모로 입력된 이름도 서버와 같은 기준으로 비교할 수 있습니다.
export const normalizeNickname = (value: string) => value.trim().normalize('NFC')

// 유효하면 null, 잘못됐으면 화면에 표시할 문구를 돌려줍니다. 서버도 같은 규칙을 재검사합니다.
export function nicknameError(value: string): string | null {
  const nickname = normalizeNickname(value)
  if (!nickname) {
    return '닉네임을 입력해 주세요.'
  }
  // L은 여러 언어의 문자, N은 숫자입니다. u 플래그로 유니코드 문자 분류를 사용합니다.
  return /^[\p{L}\p{N}_-]{2,12}$/u.test(nickname)
    ? null
    : '공백 없이 문자·숫자·_·-로 2~12자 입력해 주세요.'
}

import { useRef, useState, type FormEvent } from 'react'
import { nicknameError, normalizeNickname } from '../model/nickname'
import { rememberedNickname, rememberNickname } from '../model/session'
import styles from './NicknameForm.module.scss'

// 폼은 입력과 오류 표시만 담당합니다. 생성/입장 API 선택은 부모의 onSubmit에 맡깁니다.
interface NicknameFormProps {
  submitLabel: string
  onSubmit: (nickname: string) => Promise<void>
}

// 생성 화면과 초대 입장 화면에서 공통으로 사용하는 닉네임 폼입니다.
export function NicknameForm({ submitLabel, onSubmit }: NicknameFormProps) {
  const [nickname, setNickname] = useState(rememberedNickname)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // pending은 버튼 표시용, submitting은 렌더 전에 들어오는 중복 제출을 즉시 차단하는 용도입니다.
  const submitting = useRef(false)

  // 기본 폼 제출(페이지 이동)을 막고, 검증 → API 요청 → 성공 이름 저장 순서로 처리합니다.
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) {
      return
    }
    const validation = nicknameError(nickname)
    if (validation) {
      setError(validation)
      return
    }
    submitting.current = true
    setPending(true)
    setError(null)
    const normalized = normalizeNickname(nickname)
    try {
      await onSubmit(normalized)
      rememberNickname(normalized)
    } catch (error) {
      // 중복 닉네임 등 서버가 알려준 오류도 같은 입력 폼에 표시합니다.
      setError(error instanceof Error ? error.message : '다시 시도해 주세요.')
    } finally {
      // 성공/실패 어느 쪽이든 잠금을 풀어 이후 사용자가 다시 시도할 수 있게 합니다.
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="nickname">닉네임</label>
      {/* label과 안내 문구를 input에 연결해 스크린리더도 필드 의미와 오류를 알 수 있게 합니다. */}
      <input
        id="nickname"
        name="nickname"
        autoComplete="nickname"
        autoFocus
        value={nickname}
        disabled={pending}
        placeholder="어떤 이름으로 놀까요?"
        aria-invalid={!!error}
        aria-describedby={error ? 'nickname-help nickname-error' : 'nickname-help'}
        onChange={event => {
          setNickname(event.target.value)
          setError(null)
        }}
      />
      <p id="nickname-help" className={styles.help}>
        문자·숫자·_·- 사용 가능 · 2~12자
      </p>
      {error && (
        <p id="nickname-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? '연결하는 중…' : submitLabel}
      </button>
    </form>
  )
}

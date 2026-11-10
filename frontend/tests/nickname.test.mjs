import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nicknameError, normalizeNickname } from '../src/features/room/model/nickname.ts'

// 앞뒤 공백/분리된 한글 자모 정규화, 허용 문자와 길이 경계를 함께 검사합니다.
// 유효한 입력은 null, 잘못된 입력은 오류 문구를 돌려주는 함수 계약을 확인합니다.
test('nickname validation accepts normalized names and enforces bounds', () => {
  assert.equal(normalizeNickname('  민서  '), '민서')
  for (const name of ['민서', 'player_1', '친구-2', 'abcdefghijkl', '민서']) {
    assert.equal(nicknameError(name), null)
  }
  for (const name of ['', ' ', 'a', 'abcdefghijklm', 'two names', '<script>', '😀😀']) {
    assert.ok(nicknameError(name))
  }
})

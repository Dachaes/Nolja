import { useSyncExternalStore } from 'react'

// 뒤로/앞으로 가기 등 브라우저 주소 변경을 구독하고, 화면이 사라지면 구독을 해제합니다.
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}

// React 밖에서 관리되는 브라우저 주소를 React 렌더링과 연결합니다.
export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

// 전체 페이지를 새로 받지 않고 URL만 바꿉니다. pushState는 popstate를 자동 발생시키지
// 않으므로 직접 이벤트를 보내 위 훅이 변경된 주소로 화면을 다시 그리게 합니다.
export function navigate(path: string, replace = false) {
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

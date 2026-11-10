import { RoomRouter } from './features/room/RoomRouter'

// 앱의 최상위 화면입니다. 실제 URL별 화면 선택은 방 기능의 라우터에 맡깁니다.
export default function App() {
  return <RoomRouter />
}

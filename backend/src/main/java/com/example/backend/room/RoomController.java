package com.example.backend.room;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import com.example.backend.room.RoomDtos.*;
import jakarta.servlet.http.HttpServletResponse;

// HTTP 경로/본문/헤더를 Java 값으로 받아 서비스에 전달합니다.
// 반환한 record는 Spring이 JSON으로 변환합니다. 규칙 판단은 서비스에 모읍니다.
@RestController
@RequestMapping("/api/rooms")
public class RoomController {
    private final RoomService rooms;
    // 생성자 주입: Spring이 관리하는 RoomService를 받아 모든 요청에서 같은 저장소를 사용합니다.
    public RoomController(RoomService rooms) { this.rooms = rooms; }

    // 컨트롤러 요청 처리 전에 캐시 금지 헤더를 설정해 참가 정보와 보드가 캐시에 남지 않게 합니다.
    @ModelAttribute
    public void preventCaching(HttpServletResponse response) { response.setHeader("Cache-Control", "no-store"); }

    // JSON 본문의 nickname으로 방을 만들고, 새 리소스를 생성했다는 201 상태를 반환합니다.
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Admission create(@RequestBody NicknameRequest request) { return rooms.create(request.nickname()); }

    // PathVariable은 URL의 {code} 부분을 메서드 인자로 연결합니다. 입장 전 공개 조회입니다.
    @GetMapping("/{code}")
    public Preview preview(@PathVariable String code) { return rooms.preview(code); }

    // 해당 방의 두 번째 참가자를 등록하고 본인만 사용할 토큰을 발급합니다.
    @PostMapping("/{code}/players")
    @ResponseStatus(HttpStatus.CREATED)
    public Admission join(@PathVariable String code, @RequestBody NicknameRequest request) { return rooms.join(code, request.nickname()); }

    // 참가 후 상태 조회입니다. 헤더가 빠져도 서비스가 일관된 인증 오류 응답을 만들도록 허용합니다.
    @GetMapping("/{code}/state")
    public RoomView state(@PathVariable String code, @RequestHeader(value = "Authorization", required = false) String authorization) {
        return rooms.state(code, bearer(authorization));
    }

    // 인증 토큰과 착수 좌표/버전을 전달합니다. 토큰으로 누구의 요청인지 서버가 결정합니다.
    @PostMapping("/{code}/moves")
    public RoomView move(@PathVariable String code, @RequestHeader(value = "Authorization", required = false) String authorization,
                         @RequestBody MoveRequest request) {
        return rooms.move(code, bearer(authorization), request);
    }

    // 본인의 재대결 동의를 설정/취소합니다. 클라이언트가 다른 참가자의 ID를 지정할 수 없습니다.
    @PutMapping("/{code}/rematch")
    public RoomView rematch(@PathVariable String code, @RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestBody RematchRequest request) {
        return rooms.rematch(code, bearer(authorization), request);
    }

    // 명시적 퇴장 요청입니다. 성공 시 반환할 데이터가 없으므로 204를 사용합니다.
    @DeleteMapping("/{code}/players/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void leave(@PathVariable String code, @RequestHeader(value = "Authorization", required = false) String authorization) {
        rooms.leave(code, bearer(authorization));
    }

    // 'Bearer 실제토큰' 헤더에서 토큰 부분만 꺼냅니다. 없거나 형식이 다르면 인증 실패로 이어집니다.
    private String bearer(String authorization) {
        return authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : null;
    }

}

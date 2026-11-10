package com.example.backend.room;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.json.JsonMapper;

// 임의의 빈 포트로 실제 서버를 띄워 JSON 변환, URL 연결, HTTP 상태까지 함께 검증합니다.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RoomHttpTests {
    // Spring이 선택한 포트를 주입받아 다른 개발 서버의 포트와 충돌하지 않게 합니다.
    @LocalServerPort int port;
    @Autowired RoomService rooms;
    @Autowired JsonMapper json;
    private final HttpClient hostDevice = HttpClient.newHttpClient();
    private final HttpClient guestDevice = HttpClient.newHttpClient();

    @Test
    // 서로 다른 HTTP 클라이언트와 토큰으로 생성 → 입장 → 착수 → 퇴장을 실제 요청합니다.
    void twoIndependentClientsCreateJoinPlayAndLeaveOverHttp() throws Exception {
        var created = call(hostDevice, "POST", "", "{\"nickname\":\"민서\"}", null);
        assertEquals(201, created.statusCode());
        assertEquals("no-store", created.headers().firstValue("Cache-Control").orElseThrow());
        String code = field(created.body(), "code");
        String hostToken = field(created.body(), "token");
        // 공개 응답에 토큰이 섞이지 않는지 확인합니다.
        var preview = call(guestDevice, "GET", "/" + code, null, null);
        assertEquals(200, preview.statusCode());
        assertTrue(preview.body().contains("민서"));
        assertFalse(preview.body().contains("token"));
        var joined = call(guestDevice, "POST", "/" + code + "/players", "{\"nickname\":\"지훈\"}", null);
        assertEquals(201, joined.statusCode());
        String guestToken = field(joined.body(), "token");
        assertNotEquals(hostToken, guestToken);
        // 이 테스트는 HTTP 계층을 검증하므로 서비스 구독으로 연결을 준비합니다. 소켓 자체는 별도 테스트합니다.
        Runnable hostConnection = rooms.subscribe(code, hostToken, ignored -> {});
        Runnable guestConnection = rooms.subscribe(code, guestToken, ignored -> {});
        try {
        int revision = rooms.state(code, hostToken).revision();
        // 정원 초과, 무인증 조회, 상대 차례 착수는 각각 적절한 HTTP 오류로 거절되어야 합니다.
        assertEquals(409, call(guestDevice, "POST", "/" + code + "/players", "{\"nickname\":\"third\"}", null).statusCode());
        assertEquals(401, call(guestDevice, "GET", "/" + code + "/state", null, null).statusCode());
        // 새 재대결 경로도 참가 토큰과 본문 검증을 거쳐야 하며 진행 중에는 동의할 수 없습니다.
        assertEquals(401, call(guestDevice, "PUT", "/" + code + "/rematch", "{\"gameNumber\":1,\"ready\":true}", null).statusCode());
        assertEquals(400, call(guestDevice, "PUT", "/" + code + "/rematch", "{}", guestToken).statusCode());
        assertEquals(409, call(guestDevice, "PUT", "/" + code + "/rematch", "{\"gameNumber\":1,\"ready\":true}", guestToken).statusCode());
        String moveBody = "{\"row\":2,\"col\":3,\"revision\":" + revision + "}";
        assertEquals(409, call(guestDevice, "POST", "/" + code + "/moves", moveBody, guestToken).statusCode());
        var moved = call(hostDevice, "POST", "/" + code + "/moves", moveBody, hostToken);
        assertEquals(200, moved.statusCode());
        assertTrue(moved.body().contains("\"currentTurn\":\"white\""));
        // 다른 기기에서 조회해도 방장이 착수한 결과와 같은 상태를 받아야 합니다.
        var guestBoard = call(guestDevice, "GET", "/" + code + "/state", null, guestToken);
        // serverTime은 매 조회마다 달라지므로 보드와 버전의 일치 여부를 검사합니다.
        assertEquals(json.readTree(moved.body()).path("game"), json.readTree(guestBoard.body()).path("game"));
        assertEquals(json.readTree(moved.body()).path("revision"), json.readTree(guestBoard.body()).path("revision"));
        assertFalse(guestBoard.body().contains("token"));
        assertEquals(204, call(guestDevice, "DELETE", "/" + code + "/players/me", null, guestToken).statusCode());
        var closed = call(hostDevice, "GET", "/" + code + "/state", null, hostToken);
        assertEquals(200, closed.statusCode());
        assertEquals("closed", json.readTree(closed.body()).path("status").asString());
        assertEquals(401, call(hostDevice, "GET", "/" + code + "/state", null, null).statusCode());
        } finally { hostConnection.run(); guestConnection.run(); }
    }

    @Test
    // 본문 파싱 실패와 존재하지 않는 초대 링크도 일관된 오류 상태로 응답해야 합니다.
    void invalidJsonAndUnknownInvitesHaveActionableErrors() throws Exception {
        assertEquals(400, call(hostDevice, "POST", "", "{broken", null).statusCode());
        assertEquals(400, call(hostDevice, "POST", "", "{}", null).statusCode());
        assertEquals(404, call(hostDevice, "GET", "/ABCDEF", null, null).statusCode());
    }

    // 테스트 요청의 공통 구성입니다. 본문/토큰이 있는 경우에만 관련 헤더를 붙입니다.
    private HttpResponse<String> call(HttpClient client, String method, String path, String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/rooms" + path));
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (body != null) request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    // 이 테스트의 단순 문자열 필드만 추출하는 도우미입니다. 범용 JSON 파서로 사용하는 코드는 아닙니다.
    private String field(String json, String name) {
        var matcher = Pattern.compile("\"" + name + "\"\\s*:\\s*\"([^\"]+)\"").matcher(json);
        assertTrue(matcher.find(), "Missing field: " + name);
        return matcher.group(1);
    }
}

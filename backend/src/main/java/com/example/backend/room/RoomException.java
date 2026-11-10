package com.example.backend.room;

import org.springframework.http.HttpStatus;

// 예상 가능한 방 관련 실패를 표현합니다. 단순 문자열 대신 HTTP 상태/오류 코드를 함께 보관합니다.
public class RoomException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    // RuntimeException의 message에는 사람이 읽는 안내를, 별도 필드에는 응답 분류 정보를 넣습니다.
    public RoomException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    // 오류 처리기가 HTTP 응답을 만들 때 읽는 값입니다.
    public HttpStatus status() { return status; }
    public String code() { return code; }
}

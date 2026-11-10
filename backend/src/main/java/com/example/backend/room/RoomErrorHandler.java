package com.example.backend.room;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import com.example.backend.room.RoomDtos.ApiError;

// 방 컨트롤러에서 발생한 예외를 통일된 JSON 응답으로 변환합니다.
// 각 API 메서드에서 동일한 try/catch와 응답 작성 코드를 반복하지 않아도 됩니다.
@RestControllerAdvice(basePackages = "com.example.backend")
public class RoomErrorHandler {
    // 정원 초과/만료/인증 실패처럼 예상한 오류는 서비스가 지정한 상태와 문구를 그대로 전달합니다.
    @ExceptionHandler(RoomException.class)
    public ResponseEntity<ApiError> roomError(RoomException exception) {
        return ResponseEntity.status(exception.status()).body(new ApiError(exception.code(), exception.getMessage()));
    }

    // 잘못된 JSON이나 필드 타입은 업무 로직에 도달하기 전에 발생하므로 별도로 400 응답을 만듭니다.
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> invalidBody() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiError("INVALID_REQUEST", "요청 형식을 확인해 주세요."));
    }
}

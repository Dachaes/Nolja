package com.example.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// Spring Boot의 시작점입니다. 이 패키지 아래의 @Service, @RestController 등을 찾아 등록하고
// 내장 웹 서버를 실행하므로 컨트롤러/서비스를 직접 new로 연결할 필요가 없습니다.
@SpringBootApplication
public class BackendApplication {

    // 명령행 옵션을 Spring에 전달해 포트나 실행 환경 설정을 적용합니다.
    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }
}

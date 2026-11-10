package com.example.backend.othello;

// 게임 규칙 상태를 전달하는 값 객체입니다. currentTurn은 종료 시 null,
// passedPlayer는 직전에 자동 패스한 색상, moveCount는 초기 돌을 제외한 착수 횟수입니다.
// record라도 내부 배열까지 불변은 아니므로 외부 응답에는 OthelloRules.copy로 복사합니다.
public record GameState(
        String[][] board, String currentTurn, String status,
        Position lastMove, String passedPlayer, int moveCount) {
    // 좌표는 [행][열]이며 각각 0~7입니다. 프런트엔드의 Position과 같은 JSON 구조입니다.
    public record Position(int row, int col) {}
}

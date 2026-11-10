package com.example.backend.othello;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import com.example.backend.othello.GameState.Position;

/**
 * 최종 착수 판정을 담당하는 서버 규칙 엔진입니다. 프런트엔드의 규칙 함수는 힌트 표시용입니다.
 * HTTP나 방 인증에 의존하지 않는 순수 계산으로 분리해 규칙만 독립적으로 테스트합니다.
 */
public final class OthelloRules {
    // 상태를 저장하지 않는 static 함수 모음이므로 인스턴스 생성을 막습니다.
    private OthelloRules() {}

    // 8×8 빈 보드 중앙에 네 개의 돌을 교차 배치하고 흑이 먼저 시작합니다.
    public static GameState initial() {
        String[][] board = new String[8][8];
        board[3][3] = board[4][4] = "white";
        board[3][4] = board[4][3] = "black";
        return new GameState(board, "black", "playing", null, null, 0);
    }

    // 바깥 배열과 각 행 배열을 모두 복사합니다. 문자열과 Position은 수정 불가능한 값이라 공유합니다.
    public static GameState copy(GameState game) {
        String[][] board = Arrays.stream(game.board()).map(String[]::clone).toArray(String[][]::new);
        return new GameState(board, game.currentTurn(), game.status(), game.lastMove(), game.passedPlayer(), game.moveCount());
    }

    // 해당 칸에 두었을 때 뒤집힐 돌을 계산합니다. 빈 목록이면 놓을 수 없는 수입니다.
    public static List<Position> flips(String[][] board, String color, int row, int col) {
        List<Position> result = new ArrayList<>();
        if (!inside(row, col) || board[row][col] != null) return result;
        String opponent = opposite(color);
        // 행/열 변화량 -1, 0, 1의 조합에서 제자리 (0,0)를 빼면 8방향이 됩니다.
        for (int dr = -1; dr <= 1; dr++) {
            for (int dc = -1; dc <= 1; dc++) {
                if (dr == 0 && dc == 0) continue;
                List<Position> line = new ArrayList<>();
                int r = row + dr, c = col + dc;
                // 상대 돌이 연속되는 동안에만 후보를 수집합니다.
                while (inside(r, c) && opponent.equals(board[r][c])) {
                    line.add(new Position(r, c));
                    r += dr;
                    c += dc;
                }
                // 후보의 끝이 내 돌이어야 양끝으로 끼운 것입니다. 빈칸/보드 경계면 뒤집지 않습니다.
                if (!line.isEmpty() && inside(r, c) && color.equals(board[r][c])) result.addAll(line);
            }
        }
        return result;
    }

    // 가능한 수가 하나만 발견돼도 즉시 true를 반환합니다. 패스/종료 여부 검사에 사용합니다.
    public static boolean canPlay(String[][] board, String color) {
        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                if (!flips(board, color, row, col).isEmpty()) return true;
            }
        }
        return false;
    }

    // 기존 상태를 보존하면서 한 수를 적용한 새 상태를 만듭니다. 잘못된 수는 예외로 알립니다.
    public static GameState play(GameState game, int row, int col) {
        if (!"playing".equals(game.status())) throw new IllegalArgumentException("이미 끝난 대국입니다.");
        String color = game.currentTurn();
        List<Position> captured = flips(game.board(), color, row, col);
        if (captured.isEmpty()) throw new IllegalArgumentException("돌을 놓을 수 없는 위치입니다.");
        // 먼저 모든 뒤집기 후보를 원본에서 구한 뒤 복사본에 한꺼번에 반영합니다.
        // 뒤집힌 돌을 기준으로 추가적인 연쇄 뒤집기를 하지 않습니다.
        String[][] board = copy(game).board();
        board[row][col] = color;
        captured.forEach(position -> board[position.row()][position.col()] = color);
        String opponent = opposite(color);
        // 상대가 못 둬도 내가 둘 수 있으면 패스 후 계속합니다. 양쪽 모두 못 두면 빈칸과 무관하게 종료합니다.
        boolean opponentCanPlay = canPlay(board, opponent);
        boolean playing = opponentCanPlay || canPlay(board, color);
        return new GameState(board, playing ? (opponentCanPlay ? opponent : color) : null,
                playing ? "playing" : "finished", new Position(row, col),
                playing && !opponentCanPlay ? opponent : null, game.moveCount() + 1);
    }

    // 배열 접근 전에 경계를 확인하고, 반대 색상 계산을 공통화합니다.
    private static boolean inside(int row, int col) { return row >= 0 && row < 8 && col >= 0 && col < 8; }
    private static String opposite(String color) { return "black".equals(color) ? "white" : "black"; }
}

@echo off
rem 이 스크립트 안에서 바꾼 환경 변수는 종료 시 원래 터미널에 영향을 주지 않습니다.
setlocal
rem JAVA_HOME이 지정되지 않았을 때만 프로젝트 로컬 JDK를 찾습니다.
if not defined JAVA_HOME (
  for /d %%D in ("%~dp0..\.tools\jdk-*") do if exist "%%~fD\bin\java.exe" set "JAVA_HOME=%%~fD"
)
rem Maven이 선택한 JDK의 java 명령을 찾을 수 있도록 현재 프로세스의 PATH에 추가합니다.
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"
rem 호출한 위치와 관계없이 스크립트가 있는 backend 폴더에서 Maven을 실행합니다.
pushd "%~dp0"
rem Maven Wrapper로 개발 서버를 시작합니다. 배치 모드와 다운로드 진행 표시 생략 옵션을 사용합니다.
call mvnw.cmd -B -ntp spring-boot:run
rem 원래 폴더로 돌아가더라도 Maven의 성공 또는 실패 종료 코드를 그대로 전달합니다.
set "DEV_EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %DEV_EXIT_CODE%

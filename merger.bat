@echo off
setlocal enabledelayedexpansion

set "output=merged_output.md"

:: Удаляем старый файл, если он есть
if exist "%output%" del "%output%"

:: Пишем заголовок
echo # Собранные файлы с кодом > "%output%"
echo. >> "%output%"

:: /r означает рекурсивный обход всех подпапок
:: *.* означает любые файлы с расширением
for /r %%F in (*.js *.html *.css *.py *.json *.xml *.sql *.bat *.ps1 *.md) do (
    :: Получаем относительный путь от текущей папки
    set "relPath=%%F"
    
    :: Пропускаем сам скрипт и выходной файл (проверка по полному имени файла)
    if /i not "%%~nxF"=="%~nx0" if /i not "%%~nxF"=="%output%" (
        
        :: Формируем красивый заголовок с путем
        echo ### !relPath! >> "%output%"
        echo. >> "%output%"
        
        :: Определяем язык по расширению
        set "ext=%%~xF"
        set "lang="
        if /i "!ext!"==".js" set "lang=js"
        if /i "!ext!"==".html" set "lang=html"
        if /i "!ext!"==".htm" set "lang=html"
        if /i "!ext!"==".css" set "lang=css"
        if /i "!ext!"==".py" set "lang=python"
        if /i "!ext!"==".json" set "lang=json"
        if /i "!ext!"==".xml" set "lang=xml"
        if /i "!ext!"==".sql" set "lang=sql"
        if /i "!ext!"==".bat" set "lang=batch"
        if /i "!ext!"==".ps1" set "lang=powershell"
        if /i "!ext!"==".md" set "lang=markdown"
        
        if defined lang (
            echo ```!lang! >> "%output%"
        ) else (
            echo ``` >> "%output%"
        )
        
        echo. >> "%output%"
        
        :: Содержимое файла
        type "%%F" >> "%output%" 2>nul
        
        echo. >> "%output%"
        echo ``` >> "%output%"
        echo. >> "%output%"
        echo --- >> "%output%"
        echo. >> "%output%"
    )
)

echo.
echo Готово! Файл создан: %cd%\%output%
pause
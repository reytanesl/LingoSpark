Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
Write-Host "--- Installed Speech Voices ---"
foreach ($voice in $synth.GetInstalledVoices()) {
    $info = $voice.VoiceInfo
    Write-Host "Name: $($info.Name) | Culture: $($info.Culture) | Gender: $($info.Gender)"
}

Write-Host "--- OneCore Voices in Registry ---"
Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host $_.PSChildName
}

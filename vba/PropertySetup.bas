Attribute VB_Name = "PropertySetup"
Option Explicit

#If Mac Then
    'Calculated mode needs no native library. The file picker below targets Windows.
#ElseIf VBA7 Then
    Private Declare PtrSafe Function ETLoadLibrary Lib "kernel32" Alias "LoadLibraryW" (ByVal path As LongPtr) As LongPtr
    Private Declare PtrSafe Function ETModuleHandle Lib "kernel32" Alias "GetModuleHandleW" (ByVal name As LongPtr) As LongPtr
    Private Declare PtrSafe Function ETModulePath Lib "kernel32" Alias "GetModuleFileNameW" (ByVal handle As LongPtr, ByVal buffer As LongPtr, ByVal count As Long) As Long
    #If Win64 Then
        Private Declare PtrSafe Function ETNativeProps Lib "CoolProp_x64.dll" Alias "PropsSI" (ByVal output As String, ByVal key1 As String, ByVal value1 As Double, ByVal key2 As String, ByVal value2 As Double, ByVal fluid As String) As Double
        Private Declare PtrSafe Sub ETNativeConfig Lib "CoolProp_x64.dll" Alias "set_config_string" (ByVal key As String, ByVal value As String)
    #Else
        Private Declare PtrSafe Function ETNativeProps Lib "CoolProp_stdcall.dll" Alias "_PropsSI@32" (ByVal output As String, ByVal key1 As String, ByVal value1 As Double, ByVal key2 As String, ByVal value2 As Double, ByVal fluid As String) As Double
        Private Declare PtrSafe Sub ETNativeConfig Lib "CoolProp_stdcall.dll" Alias "_set_config_string@8" (ByVal key As String, ByVal value As String)
    #End If
    Private ETHandle As LongPtr
#Else
    Private Declare Function ETLoadLibrary Lib "kernel32" Alias "LoadLibraryW" (ByVal path As Long) As Long
    Private Declare Function ETModuleHandle Lib "kernel32" Alias "GetModuleHandleW" (ByVal name As Long) As Long
    Private Declare Function ETModulePath Lib "kernel32" Alias "GetModuleFileNameW" (ByVal handle As Long, ByVal buffer As Long, ByVal count As Long) As Long
    Private Declare Function ETNativeProps Lib "CoolProp_stdcall.dll" Alias "_PropsSI@32" (ByVal output As String, ByVal key1 As String, ByVal value1 As Double, ByVal key2 As String, ByVal value2 As Double, ByVal fluid As String) As Double
    Private Declare Sub ETNativeConfig Lib "CoolProp_stdcall.dll" Alias "_set_config_string@8" (ByVal key As String, ByVal value As String)
    Private ETHandle As Long
#End If

Private ETReady As Boolean
Private ETLoadedPath As String
Private ETLoadedRoot As String
Private ETMessage As String

Private Function ETCleanPath(ByVal value As String) As String
    value = Trim$(Replace(value, """", ""))
    Do While Len(value) > 3 And (Right$(value, 1) = "\" Or Right$(value, 1) = "/")
        value = Left$(value, Len(value) - 1)
    Loop
    ETCleanPath = value
End Function

Public Sub BrowseCoolPropFile()
    With Application.FileDialog(3)
        .Title = "Select the CoolProp DLL matching your Excel bitness"
        .AllowMultiSelect = False
        .Filters.Clear
        .Filters.Add "CoolProp library", "*.dll"
        If .Show = -1 Then ThisWorkbook.Worksheets("Guide & Setup").Range("D7").Value = .SelectedItems(1)
    End With
End Sub

Public Sub BrowseREFPROPFolder()
    With Application.FileDialog(4)
        .Title = "Select REFPROP folder containing its DLL, FLUIDS and MIXTURES"
        .AllowMultiSelect = False
        If .Show = -1 Then ThisWorkbook.Worksheets("Guide & Setup").Range("D8").Value = .SelectedItems(1)
    End With
End Sub

Public Sub ConfigurePropertyLibraries()
    On Error GoTo Failed
    Dim ws As Worksheet, filePath As String, root As String, dllName As String
    Dim loaded As String, count As Long, test As Double, refTest As Double, refName As String
    Set ws = ThisWorkbook.Worksheets("Guide & Setup")
    filePath = ETCleanPath(CStr(ws.Range("D7").Value2))
    root = ETCleanPath(CStr(ws.Range("D8").Value2))
    ETReady = False
    If filePath = "" Then Err.Raise 5, , "Choose a CoolProp DLL, or use Calculated mode."
#If Mac Then
    Err.Raise 5, , "This library loader supports Windows Excel. Use Calculated mode on Mac."
#Else
    #If Win64 Then
        dllName = "CoolProp_x64.dll"
        refName = "REFPRP64.DLL"
    #Else
        dllName = "CoolProp_stdcall.dll"
        refName = "REFPROP.DLL"
    #End If
    If LCase$(Mid$(filePath, InStrRev(filePath, "\") + 1)) <> LCase$(dllName) Then Err.Raise 5, , "Select " & dllName & " for this Excel installation."
    If Dir$(filePath) = "" Then Err.Raise 5, , "CoolProp file not found. Check D7."
    If ETLoadedPath <> "" And (StrComp(filePath, ETLoadedPath, vbTextCompare) <> 0 Or StrComp(root, ETLoadedRoot, vbTextCompare) <> 0) Then Err.Raise 5, , "Library paths changed. Save, close all Excel windows, reopen and Apply."
    If root <> "" Then
        If Dir$(root & "\" & refName) = "" Then Err.Raise 5, , "REFPROP folder must contain " & refName & "."
        If Dir$(root & "\FLUIDS", vbDirectory) = "" Or Dir$(root & "\MIXTURES", vbDirectory) = "" Then Err.Raise 5, , "REFPROP folder must contain FLUIDS and MIXTURES."
        If Environ$("COOLPROP_REFPROP_ROOT") <> "" And StrComp(ETCleanPath(Environ$("COOLPROP_REFPROP_ROOT")), root, vbTextCompare) <> 0 Then Err.Raise 5, , "COOLPROP_REFPROP_ROOT overrides D8. Use that folder or update the environment and restart Excel."
    End If
    ETHandle = ETModuleHandle(StrPtr(dllName))
    If ETHandle <> 0 Then
        loaded = String$(32768, vbNullChar)
        count = ETModulePath(ETHandle, StrPtr(loaded), Len(loaded))
        If StrComp(Left$(loaded, count), filePath, vbTextCompare) <> 0 Then Err.Raise 5, , "A different CoolProp DLL is already loaded. Close all Excel windows and retry."
    Else
        ETHandle = ETLoadLibrary(StrPtr(filePath))
        If ETHandle = 0 Then Err.Raise 5, , "Cannot load DLL. Check Excel bitness and the CoolProp installation."
    End If
    ETLoadedPath = filePath
    ETLoadedRoot = root
    If root <> "" Then
        ETNativeConfig "ALTERNATIVE_REFPROP_PATH", root
        ETNativeConfig "ALTERNATIVE_REFPROP_LIBRARY_PATH", root & "\" & refName
    End If
    test = ETNativeProps("Dmass", "T", 300, "P", 101325, "Nitrogen")
    If test <= 0 Or test > 100 Then Err.Raise 5, , "CoolProp test failed. Check the selected DLL."
    ETReady = True
    ETMessage = "CoolProp ready. "
    If root <> "" Then
        refTest = ETNativeProps("Dmass", "T", 300, "P", 101325, "REFPROP::NITROGEN")
        If refTest > 0 And refTest < 100 Then
            ETMessage = ETMessage & "REFPROP test passed."
        Else
            ETMessage = ETMessage & "REFPROP test failed; check the installation."
        End If
    Else
        ETMessage = ETMessage & "No REFPROP folder selected."
    End If
#End If
    Application.CalculateFullRebuild
    Exit Sub
Failed:
    ETMessage = Err.Description
    On Error Resume Next
    Application.CalculateFullRebuild
End Sub

Public Function ETLibraryStatus(ByVal filePath As String, ByVal root As String) As String
    Application.Volatile
    If ETLoadedPath <> "" And (StrComp(ETCleanPath(filePath), ETLoadedPath, vbTextCompare) <> 0 Or StrComp(ETCleanPath(root), ETLoadedRoot, vbTextCompare) <> 0) Then
        ETLibraryStatus = "Paths changed. Save, restart Excel, and Apply."
    ElseIf ETMessage <> "" Then
        ETLibraryStatus = ETMessage
    Else
        ETLibraryStatus = "Not loaded in this Excel session. Choose paths and Apply, or use Calculated."
    End If
End Function

Public Function ETPropsSI(ByVal output As String, ByVal key1 As String, ByVal value1 As Double, ByVal key2 As String, ByVal value2 As Double, ByVal fluid As String) As Variant
    Application.Volatile
    On Error GoTo Unavailable
    Dim result As Double, ws As Worksheet
    If Not ETReady Then GoTo Unavailable
    Set ws = ThisWorkbook.Worksheets("Guide & Setup")
    If StrComp(ETCleanPath(CStr(ws.Range("D7").Value2)), ETLoadedPath, vbTextCompare) <> 0 Then GoTo Unavailable
    If StrComp(ETCleanPath(CStr(ws.Range("D8").Value2)), ETLoadedRoot, vbTextCompare) <> 0 Then GoTo Unavailable
#If Mac Then
    GoTo Unavailable
#Else
    result = ETNativeProps(output, key1, value1, key2, value2, fluid)
    If Abs(result) > 1E+100 Then GoTo Unavailable
    ETPropsSI = result
    Exit Function
#End If
Unavailable:
    ETPropsSI = CVErr(xlErrNA)
End Function

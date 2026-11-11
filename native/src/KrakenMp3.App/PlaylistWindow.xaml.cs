using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using KrakenMp3.Core;
using Microsoft.Win32;

namespace KrakenMp3.App;

/// <summary>
/// The playlist window: virtualised list, multi-select, drag to reorder,
/// drop files/folders/playlists at a position, sort/tidy/save via the footer.
/// All edits go through <see cref="PlaylistModel"/>; playback through the host.
/// </summary>
public partial class PlaylistWindow : Window
{
    private const string RowsFormat = "KrakenMp3.Rows";
    private readonly MainWindow _host;
    private readonly PlaylistModel _model;
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(500) };

    private Point _pressPoint;
    private PlaylistRow? _pressedRow, _deferredSelect;
    private bool _dragging;

    public PlaylistWindow(MainWindow host, PlaylistModel model)
    {
        _host = host;
        _model = model;
        InitializeComponent();
        FlatFrame.Apply(this);
        List.ItemsSource = model.Rows;
        model.RowsReplaced += OnRowsReplaced;
        model.Updated += OnModelUpdated;
        List.SelectionChanged += (_, _) => UpdateInfo();
        PreviewKeyDown += (_, e) => { if (!List.IsKeyboardFocusWithin) _host.HandleKey(e, inList: false); };
        Drop += List_Drop;
        DragOver += List_DragOver;
        _timer.Tick += (_, _) => UpdateInfo();
        Loaded += (_, _) => { _timer.Start(); UpdateInfo(); ScrollToCurrent(); };
        Closed += (_, _) =>
        {
            _timer.Stop();
            model.RowsReplaced -= OnRowsReplaced;
            model.Updated -= OnModelUpdated;
        };
    }

    private void OnRowsReplaced(object? s, EventArgs e) => List.ItemsSource = _model.Rows;
    private void OnModelUpdated(object? s, EventArgs e) => UpdateInfo();

    public void ScrollToCurrent()
    {
        if (_model.RowFor(_model.Queue.Current) is { } row) List.ScrollIntoView(row);
    }

    private void UpdateInfo()
    {
        int n = _model.Rows.Count, sel = List.SelectedItems.Count;
        EmptyState.Visibility = n == 0 ? Visibility.Visible : Visibility.Collapsed;
        var pos = _host.Player.FilePath != null ? _host.Player.Position : TimeSpan.Zero;
        InfoText.Text = $"{PlaylistRow.FormatTime(pos)}/{PlaylistRow.FormatTime(_model.Total)}";
        InfoText.ToolTip = $"{n} track{(n == 1 ? "" : "s")}" + (sel > 1 ? $", {sel} selected" : "");
    }

    private List<int> SelectedIndices() =>
        List.SelectedItems.Cast<PlaylistRow>().Select(r => _model.Rows.IndexOf(r)).Where(i => i >= 0).OrderBy(i => i).ToList();

    private void Reselect(IEnumerable<PlaylistRow> rows)
    {
        List.SelectedItems.Clear();
        foreach (var r in rows) List.SelectedItems.Add(r);
        if (List.SelectedItem is PlaylistRow first) List.ScrollIntoView(first);
    }

    // ============================================================ actions

    private void PlaySelected()
    {
        var idx = SelectedIndices();
        if (idx.Count > 0) _host.PlayIndex(idx[0]);
    }

    private void RemoveSelected()
    {
        var idx = SelectedIndices();
        if (idx.Count == 0) return;
        int focus = idx[0];
        _model.RemoveIndices(idx);
        if (_model.Rows.Count > 0) List.SelectedIndex = Math.Min(focus, _model.Rows.Count - 1);
        _host.ScheduleSave();
    }

    private void MoveSelected(Func<List<int>, int> insertAt)
    {
        var idx = SelectedIndices();
        if (idx.Count == 0) return;
        var rows = idx.Select(i => _model.Rows[i]).ToList();
        _model.MoveBlock(idx, insertAt(idx));
        Reselect(rows);
        _host.ScheduleSave();
    }

    private void Crop()
    {
        var keep = new HashSet<int>(SelectedIndices());
        if (keep.Count == 0) return;
        _model.RemoveIndices(Enumerable.Range(0, _model.Rows.Count).Where(i => !keep.Contains(i)));
        _host.ScheduleSave();
    }

    // =========================================================== keyboard

    private void List_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        var key = e.Key == Key.System ? e.SystemKey : e.Key;
        bool alt = (Keyboard.Modifiers & ModifierKeys.Alt) != 0;
        bool ctrl = (Keyboard.Modifiers & ModifierKeys.Control) != 0;
        switch (key)
        {
            case Key.Delete: RemoveSelected(); break;
            case Key.Enter: PlaySelected(); break;
            case Key.Up when alt: MoveSelected(i => i[0] - 1); break;
            case Key.Down when alt: MoveSelected(i => i[^1] + 2); break;
            case Key.Home when alt: MoveSelected(_ => 0); break;
            case Key.End when alt: MoveSelected(_ => _model.Rows.Count); break;
            case Key.S when ctrl: SavePlaylist(); break;
            case Key.J when ctrl: ScrollToCurrent(); break;
            default:
                _host.HandleKey(e, inList: true);
                return;
        }
        e.Handled = true;
    }

    // ========================================================== mouse/drag

    private PlaylistRow? RowAt(DependencyObject? source) =>
        source != null && ItemsControl.ContainerFromElement(List, source) is ListBoxItem li ? li.DataContext as PlaylistRow : null;

    private void List_PreviewMouseDown(object sender, MouseButtonEventArgs e)
    {
        _pressedRow = RowAt(e.OriginalSource as DependencyObject);
        _pressPoint = e.GetPosition(List);
        _deferredSelect = null;
        // Pressing on an already-selected row keeps the multi-selection so it
        // can be dragged; a plain click (no drag) selects just that row on release.
        if (_pressedRow != null && List.SelectedItems.Contains(_pressedRow) && List.SelectedItems.Count > 1
            && Keyboard.Modifiers == ModifierKeys.None && e.ClickCount == 1)
        {
            _deferredSelect = _pressedRow;
            e.Handled = true;
            List.Focus();
        }
    }

    private void List_PreviewMouseUp(object sender, MouseButtonEventArgs e)
    {
        if (_deferredSelect != null && !_dragging) List.SelectedItem = _deferredSelect;
        _deferredSelect = null;
        _pressedRow = null;
    }

    private void List_PreviewMouseMove(object sender, MouseEventArgs e)
    {
        if (_pressedRow == null || e.LeftButton != MouseButtonState.Pressed || _dragging) return;
        var d = e.GetPosition(List) - _pressPoint;
        if (Math.Abs(d.X) < SystemParameters.MinimumHorizontalDragDistance &&
            Math.Abs(d.Y) < SystemParameters.MinimumVerticalDragDistance) return;
        if (!List.SelectedItems.Contains(_pressedRow)) List.SelectedItem = _pressedRow;
        var idx = SelectedIndices().ToArray();
        if (idx.Length == 0) return;
        _dragging = true;
        try { DragDrop.DoDragDrop(List, new DataObject(RowsFormat, idx), DragDropEffects.Move); }
        finally
        {
            _dragging = false;
            _pressedRow = null;
            _deferredSelect = null;
            DropMarker.Visibility = Visibility.Collapsed;
        }
    }

    /// <summary>Insertion index under the pointer, and where to draw the marker.</summary>
    private int InsertionIndex(DragEventArgs e, out double markerY)
    {
        markerY = -1;
        int count = _model.Rows.Count;
        if (count == 0) { markerY = 0; return 0; }
        var hit = List.InputHitTest(e.GetPosition(List)) as DependencyObject;
        if (hit != null && ItemsControl.ContainerFromElement(List, hit) is ListBoxItem li)
        {
            int i = List.ItemContainerGenerator.IndexFromContainer(li);
            var p = e.GetPosition(li);
            bool after = p.Y > li.ActualHeight / 2;
            var top = li.TranslatePoint(new Point(0, 0), DropLayer);
            markerY = after ? top.Y + li.ActualHeight - 1 : top.Y - 1;
            return after ? i + 1 : i;
        }
        // Below the last row.
        if (List.ItemContainerGenerator.ContainerFromIndex(count - 1) is ListBoxItem last)
            markerY = last.TranslatePoint(new Point(0, last.ActualHeight - 1), DropLayer).Y;
        return count;
    }

    private void List_DragOver(object sender, DragEventArgs e)
    {
        bool rows = e.Data.GetDataPresent(RowsFormat);
        bool files = e.Data.GetDataPresent(DataFormats.FileDrop);
        e.Effects = rows ? DragDropEffects.Move : files ? DragDropEffects.Copy : DragDropEffects.None;
        e.Handled = true;
        if (!rows && !files) { DropMarker.Visibility = Visibility.Collapsed; return; }

        InsertionIndex(e, out double y);
        if (y >= 0)
        {
            DropMarker.Width = Math.Max(0, List.ActualWidth - 10);
            Canvas.SetTop(DropMarker, Math.Max(0, y));
            DropMarker.Visibility = Visibility.Visible;
        }
        else DropMarker.Visibility = Visibility.Collapsed;

        // Auto-scroll near the edges.
        double py = e.GetPosition(List).Y;
        if (FindScrollViewer(List) is { } sv)
        {
            if (py < 18) sv.LineUp();
            else if (py > List.ActualHeight - 18) sv.LineDown();
        }
    }

    private void List_DragLeave(object sender, DragEventArgs e) => DropMarker.Visibility = Visibility.Collapsed;

    private void List_Drop(object sender, DragEventArgs e)
    {
        DropMarker.Visibility = Visibility.Collapsed;
        e.Handled = true;
        int at = InsertionIndex(e, out _);
        if (e.Data.GetData(RowsFormat) is int[] idx)
        {
            var rows = idx.Where(i => i < _model.Rows.Count).Select(i => _model.Rows[i]).ToList();
            _model.MoveBlock(idx, at);
            Reselect(rows);
            _host.ScheduleSave();
        }
        else if (e.Data.GetData(DataFormats.FileDrop) is string[] paths)
        {
            _host.InsertFiles(paths, at);
            Activate();
        }
    }

    private static ScrollViewer? FindScrollViewer(DependencyObject d)
    {
        if (d is ScrollViewer sv) return sv;
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(d); i++)
            if (FindScrollViewer(VisualTreeHelper.GetChild(d, i)) is { } found) return found;
        return null;
    }

    private void List_DoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (RowAt(e.OriginalSource as DependencyObject) is { } row) _host.PlayIndex(_model.Rows.IndexOf(row));
    }

    // ======================================================== footer menus

    private void ShowMenu(Button anchor, params object[] items)
    {
        var menu = new ContextMenu { PlacementTarget = anchor, Placement = System.Windows.Controls.Primitives.PlacementMode.Top };
        foreach (var it in items)
        {
            if (it is null) menu.Items.Add(new Separator());
            else if (it is (string label, Action act))
            {
                var mi = new MenuItem { Header = label };
                mi.Click += (_, _) => act();
                menu.Items.Add(mi);
            }
        }
        menu.IsOpen = true;
    }

    private void Add_Click(object sender, RoutedEventArgs e) => ShowMenu(AddButton,
        ("Add files…", (Action)(() => _host.AddFilesDialog())),
        ("Add folder…", (Action)(() => _host.AddFolderDialog())),
        ("Add playlist file (M3U)…", (Action)LoadPlaylistAppend));

    private void Rem_Click(object sender, RoutedEventArgs e)
    {
        if (sender is MenuItem) { RemoveSelected(); return; }
        ShowMenu(RemButton,
            ("Remove selected", (Action)RemoveSelected),
            ("Crop (keep only selected)", (Action)Crop),
            null!,
            ("Remove missing files", (Action)(() => Report(_model.RemoveMissing(), "missing file"))),
            ("Remove duplicates", (Action)(() => Report(_model.RemoveDuplicates(), "duplicate"))));
    }

    private void Sel_Click(object sender, RoutedEventArgs e) => ShowMenu(SelButton,
        ("Select all", (Action)(() => List.SelectAll())),
        ("Select none", (Action)(() => List.UnselectAll())),
        ("Invert selection", (Action)(() =>
        {
            var selected = new HashSet<PlaylistRow>(List.SelectedItems.Cast<PlaylistRow>());
            Reselect(_model.Rows.Where(r => !selected.Contains(r)).ToList());
        })),
        null!,
        ("Jump to playing (Ctrl+J)", (Action)ScrollToCurrent));

    private void Misc_Click(object sender, RoutedEventArgs e) => ShowMenu(MiscButton,
        ("Sort by title", (Action)(() => SortBy(PlaylistModel.SortKey.Title))),
        ("Sort by artist", (Action)(() => SortBy(PlaylistModel.SortKey.Artist))),
        ("Sort by album", (Action)(() => SortBy(PlaylistModel.SortKey.Album))),
        ("Sort by file name", (Action)(() => SortBy(PlaylistModel.SortKey.FileName))),
        ("Sort by folder and file", (Action)(() => SortBy(PlaylistModel.SortKey.Path))),
        ("Sort by length", (Action)(() => SortBy(PlaylistModel.SortKey.Duration))),
        ("Reverse order", (Action)(() => { _model.Reverse(); _host.ScheduleSave(); })),
        ("Randomise order", (Action)(() => { _model.Randomize(); _host.ScheduleSave(); })),
        null!,
        ("Save playlist… (Ctrl+S)", (Action)SavePlaylist),
        ("Load playlist (replace)…", (Action)LoadPlaylistReplace));

    private void SortBy(PlaylistModel.SortKey key)
    {
        _model.Sort(key);
        ScrollToCurrent();
        _host.ScheduleSave();
    }

    private void Report(int removed, string what)
    {
        InfoText.ToolTip = removed == 0 ? $"No {what}s found" : $"Removed {removed} {what}{(removed == 1 ? "" : "s")}";
        _host.ScheduleSave();
    }

    private void Folder_Click(object sender, RoutedEventArgs e) => _host.AddFolderDialog();

    private void Clear_Click(object sender, RoutedEventArgs e)
    {
        _model.Queue.Clear();
        _host.ScheduleSave();
    }

    private const string PlaylistFilter = "Playlists (*.m3u8;*.m3u)|*.m3u8;*.m3u";

    private void SavePlaylist()
    {
        var dlg = new SaveFileDialog { Filter = "M3U8 playlist|*.m3u8|M3U playlist|*.m3u", FileName = "Kraken playlist.m3u8" };
        if (dlg.ShowDialog(this) != true) return;
        try { _model.SavePlaylist(dlg.FileName); }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Could not save playlist", MessageBoxButton.OK, MessageBoxImage.Warning); }
    }

    private string? PickPlaylist()
    {
        var dlg = new OpenFileDialog { Filter = PlaylistFilter, Title = "Open playlist" };
        return dlg.ShowDialog(this) == true ? dlg.FileName : null;
    }

    private void LoadPlaylistAppend() { if (PickPlaylist() is { } p) _host.InsertFiles([p], _model.Rows.Count); }
    private void LoadPlaylistReplace() { if (PickPlaylist() is { } p) _host.OpenAndPlay(p); }

    // ========================================================= row menu

    private void RowMenu_Opened(object sender, RoutedEventArgs e) =>
        ShowFileItem.IsEnabled = List.SelectedItems.Count == 1;

    private void PlaySelected_Click(object sender, RoutedEventArgs e) => PlaySelected();
    private void MoveTop_Click(object sender, RoutedEventArgs e) => MoveSelected(_ => 0);
    private void MoveBottom_Click(object sender, RoutedEventArgs e) => MoveSelected(_ => _model.Rows.Count);

    private void ShowInExplorer_Click(object sender, RoutedEventArgs e)
    {
        if (List.SelectedItem is not PlaylistRow row) return;
        try { Process.Start("explorer.exe", $"/select,\"{row.Item.Path}\""); } catch (Exception) { }
    }

    private void CopyPath_Click(object sender, RoutedEventArgs e)
    {
        var paths = SelectedIndices().Select(i => _model.Rows[i].Item.Path).ToList();
        if (paths.Count > 0) try { Clipboard.SetText(string.Join(Environment.NewLine, paths)); } catch (Exception) { }
    }

    // ============================================================ chrome

    private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed && e.OriginalSource is not Button) DragMove();
    }

    private void Close_Click(object sender, RoutedEventArgs e) => _host.SetPlaylistVisible(false);
}

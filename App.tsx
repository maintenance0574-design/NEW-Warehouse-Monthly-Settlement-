
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Transaction, TransactionType } from './types';
import TransactionForm from './components/TransactionForm';
import RepairForm from './components/RepairForm';
import BatchAddForm from './components/BatchAddForm';
import Dashboard from './components/Dashboard';
import LoginScreen from './components/LoginScreen';
import { dbService } from './services/dbService';
import { exportToExcel } from './services/reportService';

const getTaipeiDate = (dateInput?: string | Date): string => {
  const d = dateInput ? new Date(dateInput) : new Date();
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
};

const ITEMS_PER_PAGE = 15;
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 分鐘 (毫秒)

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<string | null>(() => sessionStorage.getItem('wms_current_user'));
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('wms_cache_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'records' | 'repairs' | 'batch'>(
    (localStorage.getItem('ui_active_tab') as any) || 'dashboard'
  );

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_inbound' | 'scrapped' | 'repairing'>('all');
  const [recordCategoryFilter, setRecordCategoryFilter] = useState<'all' | TransactionType.INBOUND | TransactionType.USAGE | TransactionType.CONSTRUCTION>('all');
  const [viewScope, setViewScope] = useState<'monthly' | 'all'>('monthly');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [keywordSearch, setKeywordSearch] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedRepairMaterial, setSelectedRepairMaterial] = useState<string | null>(null);
  const [hoveredRecord, setHoveredRecord] = useState<{data: Transaction, x: number, y: number} | null>(null);

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // 匯出報表相關狀態
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1).padStart(2, '0')
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = useCallback(() => {
    sessionStorage.clear();
    localStorage.removeItem('wms_cache_data');
    localStorage.removeItem('ui_active_tab');
    setCurrentUser(null);
    setTransactions([]);
    setShowLogoutConfirm(false);
    setActiveTab('dashboard');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (currentUser) {
      timeoutRef.current = setTimeout(() => {
        handleLogout();
        alert('由於您已超過 5 分鐘未操作，系統已自動登出以保護資料安全。');
      }, INACTIVITY_LIMIT);
    }
  }, [currentUser, handleLogout]);

  useEffect(() => {
    if (currentUser) {
      const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
      events.forEach(event => window.addEventListener(event, resetInactivityTimer));
      resetInactivityTimer();
      return () => {
        events.forEach(event => window.removeEventListener(event, resetInactivityTimer));
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [currentUser, resetInactivityTimer]);

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setIsSyncing(true);
    try {
      const data = await dbService.fetchAll();
      if (data && data.length > 0) {
        const formatted = data.map(t => ({ ...t, date: getTaipeiDate(t.date) }));
        setTransactions(formatted);
        localStorage.setItem('wms_cache_data', JSON.stringify(formatted));
        setLastSyncTime(new Date().toLocaleTimeString('zh-TW'));
      }
    } catch (e) {
      console.error("Sync data error:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser, loadData]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYear = new Date().getFullYear();
    years.add(String(currentYear));
    transactions.forEach(t => {
      const y = t.date.split('-')[0];
      if (y && y.length === 4) years.add(y);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const isRepairs = activeTab === 'repairs';
  const isRecords = activeTab === 'records';

  const filteredList = useMemo(() => {
    return transactions.filter(t => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending_inbound') return t.type === TransactionType.INBOUND && t.isReceived === false;
        if (statusFilter === 'scrapped') return t.isScrapped === true;
        if (statusFilter === 'repairing') return t.type === TransactionType.REPAIR && !t.repairDate && !t.isScrapped;
      }
      if (activeTab === 'records') {
        if (t.type === TransactionType.REPAIR || t.isScrapped === true) return false;
        if (recordCategoryFilter !== 'all' && t.type !== recordCategoryFilter) return false;
      }
      if (activeTab === 'repairs') {
        if (t.type !== TransactionType.REPAIR) return false;
        if (selectedRepairMaterial && t.materialName !== selectedRepairMaterial) return false;
      }
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      const k = keywordSearch.toLowerCase().trim();
      if (k) {
        return t.materialName.toLowerCase().includes(k) || 
               t.materialNumber.toLowerCase().includes(k) || 
               (t.sn && t.sn.toLowerCase().includes(k)) || 
               (t.machineNumber && t.machineNumber.toLowerCase().includes(k));
      }
      return true;
    }).sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)));
  }, [transactions, activeTab, statusFilter, recordCategoryFilter, startDate, endDate, keywordSearch, selectedRepairMaterial]);

  const displayedList = useMemo(() => {
    return viewScope === 'monthly' ? filteredList.slice(0, 10) : filteredList.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [filteredList, viewScope, currentPage]);

  const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE);

  const handleAction = async (tx: Transaction) => {
    const isUpdate = transactions.some(t => t.id === tx.id);
    const result = await (isUpdate ? dbService.update(tx) : dbService.save(tx));
    if (result) {
      setTransactions(prev => isUpdate ? prev.map(t => t.id === tx.id ? tx : t) : [tx, ...prev]);
      setLastSyncTime(new Date().toLocaleTimeString('zh-TW'));
    }
    return result;
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const success = await dbService.delete(pendingDelete.id, pendingDelete.type);
    if (success) {
      setTransactions(prev => prev.filter(t => t.id !== pendingDelete.id));
      setPendingDelete(null);
      setLastSyncTime(new Date().toLocaleTimeString('zh-TW'));
    }
  };

  // 報表導出處理
  const performExport = (mode: 'current' | 'custom') => {
    let exportData = [];
    let fileName = '';

    if (mode === 'current') {
      exportData = filteredList;
      fileName = isRepairs ? '當前維修搜尋結果' : '當前核銷搜尋結果';
    } else {
      const yearMonth = `${exportConfig.year}-${exportConfig.month}`;
      exportData = transactions.filter(t => {
        const matchesDate = t.date.startsWith(yearMonth);
        const matchesTab = isRepairs ? t.type === TransactionType.REPAIR : t.type !== TransactionType.REPAIR;
        return matchesDate && matchesTab;
      });
      fileName = isRepairs ? `倉儲維修報表_${exportConfig.year}_${exportConfig.month}` : `倉儲核銷報表_${exportConfig.year}_${exportConfig.month}`;
    }

    if (exportData.length === 0) {
      alert('⚠️ 此範圍內暫無資料可供導出');
      return;
    }

    exportToExcel(exportData, fileName);
    setIsExportModalOpen(false);
  };

  const renderFilterHeader = () => (
    <div className="p-6 lg:p-8 border-b border-slate-100 flex flex-col gap-6 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-slate-100 p-1 rounded-xl flex shadow-inner shrink-0">
            <button onClick={() => {setViewScope('monthly'); setCurrentPage(1);}} className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${viewScope === 'monthly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>最新 10 筆</button>
            <button onClick={() => {setViewScope('all'); setCurrentPage(1);}} className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${viewScope === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>全部紀錄</button>
          </div>
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm shrink-0">
            <span className="text-sm">📅</span>
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => {setStartDate(e.target.value); setCurrentPage(1);}} className="bg-transparent text-xs font-black text-indigo-600 outline-none cursor-pointer p-0.5" />
              <span className="text-slate-300 text-[10px] font-black uppercase">至</span>
              <input type="date" value={endDate} onChange={e => {setEndDate(e.target.value); setCurrentPage(1);}} className="bg-transparent text-xs font-black text-indigo-600 outline-none cursor-pointer p-0.5" />
            </div>
            {(startDate || endDate) && <button onClick={() => {setStartDate(''); setEndDate(''); setSelectedRepairMaterial(null);}} className="ml-1 text-slate-300 hover:text-rose-500 transition-colors">✕</button>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <select value={statusFilter} onChange={e => {setStatusFilter(e.target.value as any); setCurrentPage(1);}} className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black outline-none text-slate-600 focus:border-indigo-500 shadow-sm h-[42px] min-w-[120px]">
              <option value="all">全部狀態</option>
              {isRecords && <option value="pending_inbound">⏳ 尚未收貨</option>}
              {isRepairs && (
                <>
                  <option value="scrapped">💀 僅報廢</option>
                  <option value="repairing">🛠️ 維修中</option>
                </>
              )}
            </select>
            {isRecords && (
              <select value={recordCategoryFilter} onChange={e => {setRecordCategoryFilter(e.target.value as any); setCurrentPage(1);}} className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black outline-none text-slate-600 focus:border-indigo-500 shadow-sm h-[42px]">
                <option value="all">所有類別</option>
                <option value={TransactionType.INBOUND}>📦 進貨</option>
                <option value={TransactionType.USAGE}>🛠️ 用料</option>
                <option value={TransactionType.CONSTRUCTION}>🏗️ 建置</option>
              </select>
            )}
          </div>
        </div>

        <button 
          onClick={() => setIsExportModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-xs shadow-lg hover:bg-indigo-600 active:scale-95 transition-all shrink-0"
        >
          <span>📥</span> 匯出 Excel 報表
        </button>
      </div>
      <div className="relative">
        <input type="text" placeholder="搜尋料件、PN、SN 或機台編號..." value={keywordSearch} onChange={e => {setKeywordSearch(e.target.value); setCurrentPage(1);}} className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/5 outline-none focus:border-indigo-500 shadow-sm transition-all" />
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xl">🔍</span>
      </div>
    </div>
  );

  const renderPagination = () => {
    if (viewScope === 'monthly' || totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between px-8 py-4 bg-slate-50 border-t border-slate-100">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">共 {filteredList.length} 筆資料</p>
        <div className="flex items-center gap-3">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 rounded-lg bg-white border shadow-sm text-slate-400 hover:text-indigo-600 disabled:opacity-20 transition-colors text-[10px]">◀</button>
          <span className="font-black text-slate-600 text-xs">{currentPage} / {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 rounded-lg bg-white border shadow-sm text-slate-400 hover:text-indigo-600 disabled:opacity-20 transition-colors text-[10px]">▶</button>
        </div>
      </div>
    );
  };

  if (!currentUser) return <LoginScreen onLogin={u => { setCurrentUser(u); sessionStorage.setItem('wms_current_user', u); loadData(); }} />;

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8fafc] font-['Noto_Sans_TC']">
      <aside className="w-full lg:w-72 bg-[#0f172a] text-white p-8 flex flex-col shrink-0 lg:fixed lg:h-full z-40 shadow-2xl">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg">倉</div>
          <h1 className="text-lg font-black tracking-wider">智慧倉儲月結</h1>
        </div>
        <nav className="space-y-1 flex-1">
          {[{ id: 'dashboard', label: '📊 結算總覽' }, { id: 'records', label: '📄 核銷紀錄' }, { id: 'repairs', label: '🛠️ 維修中心' }, { id: 'batch', label: '📥 快速批次' }].map(item => (
            <button key={item.id} onClick={() => { setActiveTab(item.id as any); setStatusFilter('all'); setViewScope('monthly'); setCurrentPage(1); setSelectedRepairMaterial(null); }} className={`w-full text-left px-5 py-4 rounded-xl font-black transition-all ${activeTab === item.id ? 'bg-indigo-600 shadow-xl translate-x-1' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>{item.label}</button>
          ))}
        </nav>
        
        <div className="mt-auto pt-6 space-y-3">
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">系統同步狀態</span>
              <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`}></div>
            </div>
            <p className="text-[11px] font-bold text-slate-300 mb-3">最後更新：{lastSyncTime || '尚未同步'}</p>
            <button onClick={loadData} disabled={isSyncing} className={`w-full py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${isSyncing ? 'bg-slate-700 text-slate-500' : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white'}`}>
              {isSyncing ? '同步中...' : '🔄 雲端重新整理'}
            </button>
          </div>
          <button onClick={() => setShowLogoutConfirm(true)} className="w-full py-4 bg-rose-600/90 text-white rounded-xl font-black hover:bg-rose-600 transition-all shadow-lg active:scale-95">安全登出</button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-72 min-h-screen p-6 lg:p-10 flex flex-col gap-10 relative">
        {hoveredRecord && hoveredRecord.data && (
          <div 
            className="fixed z-[999] bg-[#0f172a]/95 backdrop-blur-xl border border-white/10 rounded-[2.5rem] shadow-2xl p-8 w-[340px] pointer-events-none ring-1 ring-white/5 animate-in fade-in zoom-in duration-150"
            style={{ 
              left: hoveredRecord.x + 25 + 320 > window.innerWidth ? hoveredRecord.x - 365 : hoveredRecord.x + 25, 
              top: hoveredRecord.y + 25 + 420 > window.innerHeight ? hoveredRecord.y - 425 : hoveredRecord.y + 25 
            }}
          >
            <div className="space-y-6">
              <div className="border-b border-white/10 pb-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">資產明細報表</p>
                  <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[9px] font-black uppercase">{hoveredRecord.data.type}</span>
                </div>
                <h4 className="text-white font-black text-xl leading-tight mb-3">{hoveredRecord.data.materialName}</h4>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-slate-800/80 px-2 py-1 rounded-lg text-[10px] font-black text-slate-300 border border-white/5">PN: {hoveredRecord.data.materialNumber || '無'}</span>
                  <span className="bg-indigo-900/40 px-2 py-1 rounded-lg text-[10px] font-black text-indigo-300">ID: {hoveredRecord.data.machineNumber || '未標'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div>
                  <p className="text-[9px] font-black text-slate-500 mb-1">結算數量</p>
                  <p className="text-white text-base font-black tabular-nums">{hoveredRecord.data.quantity}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-500 mb-1">單價</p>
                  <p className="text-white text-base font-black tabular-nums">NT$ {hoveredRecord.data.unitPrice.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <span className="text-[10px] font-black text-slate-400 uppercase">操作: {hoveredRecord.data.operator}</span>
                <span className="text-white font-black text-lg tabular-nums">NT$ {hoveredRecord.data.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div className="xl:col-span-8"><Dashboard transactions={transactions} /></div>
            <div className="xl:col-span-4 flex flex-col gap-8">
              <TransactionForm onSave={handleAction} existingTransactions={transactions} currentUser={currentUser!} />
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                <h4 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-3">
                  <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                  智慧系統提示
                </h4>
                <p className="text-sm text-slate-500 font-bold leading-relaxed mb-6">
                  系統目前正連接至您的專屬後端。本月已處理 <span className="text-indigo-600">{transactions.filter(t => t.date.startsWith(new Date().toISOString().slice(0, 7))).length}</span> 筆結算紀錄。
                </p>
                <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <span className="text-xl">💡</span>
                  <span className="text-xs font-black text-indigo-600 uppercase">建議定期點擊「立即強制刷新」以獲取最新雲端數據。</span>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'repairs' ? (
          <div className="space-y-10">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
               <RepairForm onSave={handleAction} existingTransactions={transactions} currentUser={currentUser!} />
               <div className="bg-[#0f172a] rounded-[2.5rem] p-10 flex flex-col h-[520px] shadow-2xl relative overflow-hidden border border-white/5">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[100px] -mr-32 -mt-32"></div>
                <div className="relative z-10">
                  <h3 className="text-2xl font-black text-white mb-8">維修中心概況</h3>
                  <div className="grid grid-cols-2 gap-6 mb-10">
                    <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">待完修項目</p>
                      <p className="text-3xl font-black text-amber-400">{transactions.filter(t => t.type === TransactionType.REPAIR && !t.repairDate && !t.isScrapped).length}</p>
                    </div>
                    <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">本月報廢數</p>
                      <p className="text-3xl font-black text-rose-500">{transactions.filter(t => t.isScrapped && t.date.startsWith(new Date().toISOString().slice(0, 7))).length}</p>
                    </div>
                  </div>
                  <div className="p-8 bg-emerald-500/10 rounded-[2.5rem] border border-emerald-500/20">
                    <p className="text-sm font-bold text-emerald-400/80 leading-relaxed">
                      維修紀錄將獨立於一般月結之外，但在總額統計中仍會被計入。您可以透過右側表單快速登錄新的維修件或標記報廢。
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200/60 overflow-hidden">
              {renderFilterHeader()}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest text-[11px] border-b">
                    <tr><th className="px-8 py-5">序號 / 機台</th><th className="px-8 py-5">維修零件</th><th className="px-8 py-5 text-right">結算金額</th><th className="px-8 py-5 text-center">操作</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold">
                    {displayedList.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-all group/row cursor-default" onMouseEnter={(e) => setHoveredRecord({ data: t, x: e.clientX, y: e.clientY })} onMouseLeave={() => setHoveredRecord(null)}>
                        <td className="px-8 py-5 text-sm font-black text-slate-800">{t.sn || '--'}<div className="text-[10px] text-slate-400 mt-1">{t.machineNumber || '未指定機台'}</div></td>
                        <td className="px-8 py-5">
                          <div className="text-slate-900 truncate max-w-xs">{t.materialName}</div>
                          <div className="flex gap-2 mt-1 items-center">
                            <span className="text-[10px] text-rose-500 font-black truncate max-w-[150px]">{t.faultReason}</span>
                            {t.isScrapped && <span className="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">💀 報廢</span>}
                            {!t.repairDate && !t.isScrapped && <span className="bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">🛠️ 維修中</span>}
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right font-black text-slate-900 tabular-nums">NT$ {t.total.toLocaleString()}</td>
                        <td className="px-8 py-5 text-center">
                          <div className="flex justify-center gap-4 opacity-0 group-hover/row:opacity-100 transition-all">
                            <button onClick={(e) => {e.stopPropagation(); setEditingTransaction(t);}} className="p-2 hover:bg-white rounded-lg shadow-sm text-slate-400 hover:text-indigo-600 transition-colors">✏️</button>
                            <button onClick={(e) => {e.stopPropagation(); setPendingDelete(t);}} className="p-2 hover:bg-white rounded-lg shadow-sm text-slate-400 hover:text-rose-600 transition-colors">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPagination()}
            </div>
          </div>
        ) : activeTab === 'records' ? (
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200/60 overflow-hidden">
            {renderFilterHeader()}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest text-[11px] border-b">
                  <tr><th className="px-8 py-5">日期 / 類別</th><th className="px-8 py-5">料件明細</th><th className="px-8 py-5 text-right">數量</th><th className="px-8 py-5 text-right">金額</th><th className="px-8 py-5 text-center">操作</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {displayedList.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-all group/row cursor-default" onMouseEnter={(e) => setHoveredRecord({ data: t, x: e.clientX, y: e.clientY })} onMouseLeave={() => setHoveredRecord(null)}>
                      <td className="px-8 py-5 text-xs text-slate-500 font-black">{t.date}<div className="text-[10px] text-indigo-600 font-black uppercase mt-1 tracking-widest">{t.type}</div></td>
                      <td className="px-8 py-5">
                        <div className="text-slate-900 truncate max-w-xs">{t.materialName}</div>
                        <div className="flex flex-wrap gap-2 mt-1 items-center font-black">
                          <span className="text-[10px] text-slate-400">PN: {t.materialNumber || '--'}</span>
                          {t.type === TransactionType.INBOUND && !t.isReceived && (
                            <span className="bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-tighter shadow-sm animate-pulse">⏳ 尚未收貨</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right font-black text-slate-700 tabular-nums">{t.quantity}</td>
                      <td className="px-8 py-6 text-right font-black text-indigo-600 tabular-nums">NT$ {t.total.toLocaleString()}</td>
                      <td className="px-8 py-5 text-center">
                        <div className="flex justify-center gap-4 opacity-0 group-hover/row:opacity-100 transition-all">
                          <button onClick={() => setEditingTransaction(t)} className="p-2 hover:bg-white rounded-lg shadow-sm text-slate-400 hover:text-indigo-600">✏️</button>
                          <button onClick={() => setPendingDelete(t)} className="p-2 hover:bg-white rounded-lg shadow-sm text-slate-400 hover:text-rose-600">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {displayedList.length === 0 && (
                    <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-300 font-black italic">目前尚無符合篩選條件的核銷紀錄</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {renderPagination()}
          </div>
        ) : (
          <BatchAddForm onBatchSave={async txList => { const s = await dbService.batchSave(txList); if(s) await loadData(); return s; }} existingTransactions={transactions} onComplete={() => setActiveTab('records')} currentUser={currentUser!} />
        )}
      </main>

      {/* 匯出報表彈窗 (Export Modal) */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[800] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 p-8 text-center relative">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg">📋</div>
              <h3 className="text-xl font-black text-white">報表導出中心</h3>
              <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Warehouse Report Generation</p>
              <button onClick={() => setIsExportModalOpen(false)} className="absolute top-6 right-8 text-slate-500 hover:text-white transition-colors">✕</button>
            </div>
            
            <div className="p-10 space-y-8">
              {/* 指定年份月份匯出 */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-1.5 h-4 bg-indigo-600 rounded-full"></span>
                  <label className="text-sm font-black text-slate-900 uppercase tracking-widest">匯出指定月份資料</label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black text-slate-400 ml-1">年份</p>
                    <select 
                      value={exportConfig.year} 
                      onChange={e => setExportConfig({...exportConfig, year: e.target.value})}
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all"
                    >
                      {availableYears.map(y => <option key={y} value={y}>{y} 年</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black text-slate-400 ml-1">月份</p>
                    <select 
                      value={exportConfig.month} 
                      onChange={e => setExportConfig({...exportConfig, month: e.target.value})}
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all"
                    >
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = String(i + 1).padStart(2, '0');
                        return <option key={m} value={m}>{m} 月</option>;
                      })}
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => performExport('custom')}
                  className="w-full py-4.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  📥 匯出 {exportConfig.year} 年 {exportConfig.month} 月報表
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                <div className="relative flex justify-center text-[10px] font-black uppercase text-slate-300 tracking-[0.3em]"><span className="bg-white px-4">OR</span></div>
              </div>

              {/* 匯出當前搜尋結果 */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-1.5 h-4 bg-slate-400 rounded-full"></span>
                  <label className="text-sm font-black text-slate-900 uppercase tracking-widest">當前搜尋範圍</label>
                </div>
                <p className="text-xs font-bold text-slate-400 leading-relaxed px-1">將匯出您目前在畫面上看到的搜尋結果（共 {filteredList.length} 筆資料）。</p>
                <button 
                  onClick={() => performExport('current')}
                  className="w-full py-4.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all"
                >
                  🔍 匯出當前篩選結果
                </button>
              </div>
            </div>
            
            <div className="bg-slate-50 p-6 text-center border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Secure Export Protocol • XLSX Format</p>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[600] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white p-12 rounded-[3.5rem] max-w-sm w-full shadow-2xl text-center border border-slate-100">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">🗑️</div>
            <h3 className="text-2xl font-black text-slate-900 mb-8">確定要刪除此筆<br/>紀錄嗎？</h3>
            <div className="flex flex-col gap-3">
              <button onClick={confirmDelete} className="w-full py-4.5 bg-rose-600 text-white rounded-2xl font-black shadow-lg active:scale-95 transition-all">確定刪除</button>
              <button onClick={() => setPendingDelete(null)} className="w-full py-3.5 text-slate-400 font-black hover:text-slate-600 transition-colors">取消</button>
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[700] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white p-12 rounded-[3.5rem] max-w-sm w-full text-center shadow-2xl border border-slate-100">
            <div className="w-24 h-24 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-8 shadow-inner">🚪</div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">準備登出系統？</h3>
            <div className="flex flex-col gap-3 mt-8">
              <button onClick={handleLogout} className="w-full py-4.5 bg-slate-900 text-white rounded-2xl font-black shadow-lg hover:bg-rose-600 transition-all">確認登出</button>
              <button onClick={() => setShowLogoutConfirm(false)} className="w-full py-3.5 text-slate-400 font-black hover:text-slate-600 transition-colors">取消</button>
            </div>
          </div>
        </div>
      )}

      {editingTransaction && (
        <div className="fixed inset-0 z-[500] bg-slate-950/75 flex items-center justify-center p-6 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md my-auto animate-in slide-in-from-bottom duration-300">
            {editingTransaction.type === TransactionType.REPAIR ? 
              <RepairForm onSave={handleAction} initialData={editingTransaction} onCancel={() => setEditingTransaction(null)} currentUser={currentUser!} /> :
              <TransactionForm onSave={handleAction} initialData={editingTransaction} onCancel={() => setEditingTransaction(null)} currentUser={currentUser!} />
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

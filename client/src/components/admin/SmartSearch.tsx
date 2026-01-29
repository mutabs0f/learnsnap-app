import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, User, Smartphone } from "lucide-react";
import { SearchResult } from "./types";

interface SmartSearchProps {
  fetchWithAuth: (url: string) => Promise<unknown>;
  onSelectDevice?: (deviceId: string) => void;
}

export function SmartSearch({ fetchWithAuth, onSelectDevice }: SmartSearchProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);

  const handleSearch = async () => {
    if (!query.trim() || query.length < 2) return;
    
    setIsSearching(true);
    try {
      const response = await fetchWithAuth(`/api/admin/search?q=${encodeURIComponent(query)}`) as { success: boolean; data: { results: SearchResult } };
      if (response.success) {
        setResults(response.data.results);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" aria-hidden="true" />
          بحث ذكي
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="ابحث بـ Device ID, Email, أو User ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            data-testid="input-admin-search"
          />
          <Button 
            onClick={handleSearch} 
            disabled={isSearching || query.length < 2}
            data-testid="button-admin-search"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="w-4 h-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        {results && (
          <div className="space-y-4">
            {results.users.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" aria-hidden="true" />
                  المستخدمين ({results.users.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-start p-2">البريد</th>
                        <th className="text-start p-2">الاسم</th>
                        <th className="text-start p-2">الرصيد</th>
                        <th className="text-start p-2">التسجيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.users.map((user) => (
                        <tr key={user.id} className="border-b hover-elevate">
                          <td className="p-2 font-mono text-xs">{user.email}</td>
                          <td className="p-2">{user.name || "-"}</td>
                          <td className="p-2">{user.credits ?? "-"}</td>
                          <td className="p-2">{formatDate(user.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {results.devices.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" aria-hidden="true" />
                  الأجهزة ({results.devices.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-start p-2">Device ID</th>
                        <th className="text-start p-2">الرصيد</th>
                        <th className="text-start p-2">المستخدم</th>
                        <th className="text-start p-2">آخر تحديث</th>
                        <th className="text-start p-2">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.devices.map((device) => (
                        <tr key={device.device_id} className="border-b hover-elevate">
                          <td className="p-2 font-mono text-xs">{device.device_id.substring(0, 12)}...</td>
                          <td className="p-2">{device.pages_remaining}</td>
                          <td className="p-2">{device.user_email || "-"}</td>
                          <td className="p-2">{formatDate(device.updated_at)}</td>
                          <td className="p-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => onSelectDevice?.(device.device_id)}
                              data-testid={`button-select-device-${device.device_id.substring(0, 8)}`}
                            >
                              إدارة
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {results.users.length === 0 && results.devices.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                لا توجد نتائج
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

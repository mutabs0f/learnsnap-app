import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowRight, 
  BookOpen, 
  Clock, 
  GraduationCap, 
  Calculator, 
  Beaker, 
  Globe, 
  Moon,
  Users,
  Play,
  Check,
  Loader2
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SampleChapter, Child } from "@shared/schema";

const subjectIcons: Record<string, typeof BookOpen> = {
  math: Calculator,
  science: Beaker,
  arabic: BookOpen,
  english: Globe,
  islamic: Moon,
  social: Users,
};

const subjectLabels: Record<string, string> = {
  math: "رياضيات",
  science: "علوم",
  arabic: "لغة عربية",
  english: "لغة إنجليزية",
  islamic: "تربية إسلامية",
  social: "اجتماعيات",
};

const difficultyLabels: Record<string, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "صعب",
};

const difficultyColors: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  hard: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

export default function ContentLibrary() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const parentId = localStorage.getItem("userId");
  
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const { data: sampleChapters, isLoading } = useQuery<SampleChapter[]>({
    queryKey: ["/api/sample-chapters"],
  });

  const { data: children } = useQuery<Child[]>({
    queryKey: ["/api/children", parentId],
    enabled: !!parentId,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ sampleId, childId }: { sampleId: string; childId: string }) => {
      return apiRequest("POST", `/api/sample-chapters/${sampleId}/assign`, {
        childId,
        parentId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapters", parentId] });
      toast({
        title: "تم إسناد الفصل",
        description: "تم إضافة الفصل إلى قائمة دروس الطفل بنجاح",
      });
      setAssigningId(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إسناد الفصل، حاول مرة أخرى",
        variant: "destructive",
      });
      setAssigningId(null);
    },
  });

  const filteredChapters = sampleChapters?.filter((chapter) => {
    if (selectedSubject !== "all" && chapter.subject !== selectedSubject) return false;
    if (selectedGrade !== "all" && chapter.grade !== parseInt(selectedGrade, 10)) return false;
    return true;
  });

  const handleAssign = (sampleId: string) => {
    if (!selectedChild) {
      toast({
        title: "اختر طفلاً",
        description: "يرجى اختيار الطفل الذي تريد إسناد الفصل له",
        variant: "destructive",
      });
      return;
    }
    setAssigningId(sampleId);
    assignMutation.mutate({ sampleId, childId: selectedChild });
  };

  if (!parentId) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      <header className="bg-white dark:bg-gray-800 border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold font-arabic">مكتبة المحتوى</h1>
                <p className="text-sm text-muted-foreground font-arabic">دروس جاهزة للتعلم</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 space-y-4">
          <p className="text-muted-foreground font-arabic">
            استعرض الدروس التعليمية الجاهزة واختر ما يناسب مستوى طفلك
          </p>

          <div className="flex flex-wrap gap-4">
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="w-40" data-testid="select-subject-filter">
                <SelectValue placeholder="كل المواد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواد</SelectItem>
                <SelectItem value="math">رياضيات</SelectItem>
                <SelectItem value="science">علوم</SelectItem>
                <SelectItem value="arabic">لغة عربية</SelectItem>
                <SelectItem value="english">لغة إنجليزية</SelectItem>
                <SelectItem value="islamic">تربية إسلامية</SelectItem>
                <SelectItem value="social">اجتماعيات</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedGrade} onValueChange={setSelectedGrade}>
              <SelectTrigger className="w-40" data-testid="select-grade-filter">
                <SelectValue placeholder="كل الصفوف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الصفوف</SelectItem>
                {[1, 2, 3, 4, 5, 6].map((grade) => (
                  <SelectItem key={grade} value={grade.toString()}>
                    الصف {grade === 1 ? "الأول" : grade === 2 ? "الثاني" : grade === 3 ? "الثالث" : grade === 4 ? "الرابع" : grade === 5 ? "الخامس" : "السادس"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {children && children.length > 0 && (
              <Select value={selectedChild} onValueChange={setSelectedChild}>
                <SelectTrigger className="w-48" data-testid="select-child">
                  <SelectValue placeholder="اختر الطفل" />
                </SelectTrigger>
                <SelectContent>
                  {children.map((child) => (
                    <SelectItem key={child.id} value={child.id}>
                      {child.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredChapters && filteredChapters.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredChapters.map((chapter) => {
              const SubjectIcon = subjectIcons[chapter.subject] || BookOpen;
              
              return (
                <Card 
                  key={chapter.id} 
                  className="hover-elevate transition-all"
                  data-testid={`card-sample-chapter-${chapter.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <SubjectIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg font-arabic">
                            {chapter.titleAr}
                          </CardTitle>
                          <CardDescription className="font-arabic">
                            {subjectLabels[chapter.subject] || chapter.subject}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={difficultyColors[chapter.difficulty || "medium"]}
                      >
                        {difficultyLabels[chapter.difficulty || "medium"]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground font-arabic line-clamp-2">
                      {chapter.descriptionAr}
                    </p>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <GraduationCap className="w-4 h-4" />
                        <span className="font-arabic">الصف {chapter.grade}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span className="font-arabic">{chapter.estimatedMinutes} دقيقة</span>
                      </div>
                    </div>

                    <Button 
                      className="w-full gap-2 font-arabic"
                      onClick={() => handleAssign(chapter.id)}
                      disabled={!selectedChild || assigningId === chapter.id}
                      data-testid={`button-assign-${chapter.id}`}
                    >
                      {assigningId === chapter.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          جاري الإضافة...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          إضافة للطفل
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-arabic font-semibold mb-2">لا توجد دروس</h3>
            <p className="text-muted-foreground font-arabic text-sm">
              {selectedSubject !== "all" || selectedGrade !== "all" 
                ? "لا توجد دروس بهذه المعايير، جرب تغيير الفلاتر"
                : "سيتم إضافة المزيد من الدروس قريباً"
              }
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}

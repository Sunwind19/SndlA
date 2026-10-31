class Main {
    public static void main(String args[]){
        System.out.print(gcf(36, 16));
    }
    public static int gcf(int a, int b) {
        if (a > b) {
            return gcf(a-b, b);
        }
        else if (b > a) {
            return gcf(a, b-a);
        }
        else {
            return a;
        }

    }
}